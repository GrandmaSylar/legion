// messaging: send SMS to parents and staff through Arkesel.
//
// The browser never sees the API key and never writes messages. This function
//   - checks who is calling and what they may send,
//   - works out the recipients from the database (the audience is never taken
//     from the browser, so a client cannot invent one),
//   - records every message, then sends in small claimed batches so two
//     overlapping calls never send the same message twice,
//   - and keeps the raw provider reply on each message to diagnose problems.
//
// Email goes out through Resend from a PhiNova address, with replies going to the school's own
// email. Secrets: RESEND_API_KEY, EMAIL_FROM (the verified sending address). Optional
// EMAIL_SANDBOX=true records every email as sent without contacting the provider.
//
// Secret (supabase secrets set): ARKESEL_API_KEY. The sender ID (3 to 11 letters
// or digits, approved by Arkesel) is set per school in the app (message_settings);
// ARKESEL_SENDER_ID is only a server-wide fallback for a school that has not set
// one. Optional ARKESEL_SANDBOX=true makes every send a dry run: accepted by
// Arkesel but neither delivered nor billed.
//
// Provider details below follow Arkesel's public SDKs (POST /api/v2/sms/send,
// GET /api/v2/clients/balance-details, GET /api/v2/sms/{id}); replies are parsed
// defensively because their exact shape is not documented in those SDKs.
import { createClient } from "npm:@supabase/supabase-js@2";
import { countSegments, formatMoney, normalizePhone, parseNumberList, render } from "./sms.ts";
import { isStale, sameSecret, withinSendingHours } from "./auto.ts";
import {
  buildEmail, cleanHeader, friendlyEmailError, fromHeader, MAX_EMAIL_BODY, normalizeEmail, parseEmailList,
} from "./email.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const API = "https://sms.arkesel.com/api/v2";
const EMAIL_API = "https://api.resend.com";
type Channel = "sms" | "email";
const MAX_RECIPIENTS = 2000;
const MAX_BODY = 640; // four SMS parts
const SEND_BUDGET_MS = 100_000; // stay inside the function's time limit
const CLAIM_SIZE = 20;
const CONCURRENCY = 5;
const AUDIENCES = ["all_parents", "class_parents", "fee_balance", "absent_today", "staff", "teachers", "custom"];

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function apiConfig() {
  const key = Deno.env.get("ARKESEL_API_KEY")?.trim();
  if (!key) return null;
  return { key, forceSandbox: Deno.env.get("ARKESEL_SANDBOX")?.trim().toLowerCase() === "true" };
}

function requireKey() {
  const c = apiConfig();
  if (!c) throw new HttpError(503, "SMS is not set up yet. The Arkesel API key has not been added to the server.");
  return c;
}

function emailConfig() {
  const key = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("EMAIL_FROM")?.trim();
  if (!key || !from) return null;
  return { key, from, sandbox: Deno.env.get("EMAIL_SANDBOX")?.trim().toLowerCase() === "true" };
}

function requireEmail() {
  const c = emailConfig();
  if (!c) throw new HttpError(503, "Email is not set up yet. The email provider key and sending address have not been added to the server.");
  return c;
}

async function resend(path: string, init: RequestInit = {}) {
  const c = requireEmail();
  const res = await fetch(`${EMAIL_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: Record<string, any> = {};
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  return { status: res.status, body };
}

/** The sender ID in force for a school: its own setting, else the server-wide fallback. */
async function senderFor(schoolId: string): Promise<{ sender: string; source: "school" | "server" } | null> {
  const { data } = await admin.from("message_settings").select("sender_id").eq("school_id", schoolId).maybeSingle();
  const own = (data?.sender_id as string | null | undefined)?.trim();
  if (own) return { sender: own, source: "school" };
  const fallback = Deno.env.get("ARKESEL_SENDER_ID")?.trim();
  if (fallback) {
    if (fallback.length > 11) throw new HttpError(503, "The server's SMS sender ID must be 11 characters or fewer.");
    return { sender: fallback, source: "server" };
  }
  return null;
}

async function requireSender(schoolId: string): Promise<string> {
  const found = await senderFor(schoolId);
  if (!found) throw new HttpError(503, "No SMS sender ID is set. Add one under Messages, Setup.");
  return found.sender;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ─── Arkesel ─────────────────────────────────────────────────────────────────

/** Turn the provider's complaint into something a school administrator can act on. */
function friendlyProviderError(raw: string): string {
  const t = raw.toLowerCase();
  if (/api.?key|authenticat|unauthori[sz]ed|forbidden/.test(t)) return "Arkesel rejected the API key.";
  if (/balance|credit|insufficient|fund/.test(t)) return "Not enough SMS credit. Top up your Arkesel account.";
  if (/sender/.test(t)) return "Arkesel does not accept this sender ID. It may not be approved yet.";
  if (/recipient|number|phone|invalid.*msisdn/.test(t)) return "Arkesel rejected the phone number.";
  return raw.slice(0, 200);
}

async function arkesel(path: string, init: RequestInit = {}) {
  const p = requireKey();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "api-key": p.key, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: res.status, body: body as Record<string, any> };
}

function parseSendReply(status: number, body: Record<string, any>) {
  const ok = status >= 200 && status < 300 && (body?.status === "success" || body?.code === "OK" || body?.status === "ok");
  const first = Array.isArray(body?.data) ? body.data[0] : body?.data;
  const id = first?.id ?? first?.message_id ?? body?.id ?? null;
  const complaint = String(body?.message ?? body?.error ?? first?.message ?? body?.status ?? `HTTP ${status}`);
  return { ok, id: id ? String(id) : null, error: ok ? null : friendlyProviderError(complaint) };
}

async function sendSms(m: Record<string, any>, sandbox: boolean, sender: string) {
  const payload = { sender, message: m.body, recipients: [m.recipient_phone], sandbox };
  let last = { status: 0, body: {} as Record<string, any> };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      last = await arkesel("/sms/send", { method: "POST", body: JSON.stringify(payload) });
    } catch (e) {
      last = { status: 0, body: { error: e instanceof Error ? e.message : "network error" } };
    }
    // Retry only when the request clearly did not reach the provider's logic.
    if (last.status !== 0 && last.status !== 429 && last.status < 500) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  const parsed = parseSendReply(last.status, last.body);
  const now = new Date().toISOString();
  await admin.from("messages").update(
    parsed.ok
      ? { status: "sent", sent_at: now, provider_message_id: parsed.id, provider_response: last.body, error: null }
      : { status: "failed", provider_message_id: parsed.id, provider_response: last.body, error: parsed.error },
  ).eq("id", m.id);
  return parsed.ok;
}

async function sendEmail(
  m: Record<string, any>, sandbox: boolean, school: { name: string; replyTo: string | null }, from: string,
) {
  const now = new Date().toISOString();
  if (sandbox) {
    await admin.from("messages").update({
      status: "sent", sent_at: now, provider_message_id: `sandbox-${m.id}`, provider_response: { sandbox: true }, error: null,
    }).eq("id", m.id);
    return true;
  }
  const mail = buildEmail(m.body as string, school.name, school.replyTo);
  const payload: Record<string, unknown> = {
    from: fromHeader(school.name, from), to: [m.recipient_email], subject: cleanHeader(String(m.subject ?? "")) || school.name,
    text: mail.text, html: mail.html,
  };
  if (school.replyTo) payload.reply_to = school.replyTo;
  let last = { status: 0, body: {} as Record<string, any> };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // The idempotency key makes a repeat harmless if our first try did reach the provider.
      last = await resend("/emails", { method: "POST", body: JSON.stringify(payload), headers: { "Idempotency-Key": `message-${m.id}` } });
    } catch (e) {
      last = { status: 0, body: { error: e instanceof Error ? e.message : "network error" } };
    }
    if (last.status !== 0 && last.status !== 429 && last.status < 500) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  const id = last.body?.id ? String(last.body.id) : null;
  const ok = last.status >= 200 && last.status < 300 && !!id;
  await admin.from("messages").update(
    ok
      ? { status: "sent", sent_at: now, provider_message_id: id, provider_response: last.body, error: null }
      : { status: "failed", provider_message_id: id, provider_response: last.body, error: friendlyEmailError(last.status, last.body) },
  ).eq("id", m.id);
  return ok;
}

/** Send what is queued for one batch until the time budget runs out. */
async function processBatch(batchId: string) {
  const { data: batch } = await admin.from("message_batches").select("sandbox, school_id, channel").eq("id", batchId).maybeSingle();
  if (!batch) throw new HttpError(404, "Batch not found.");
  let send: (m: Record<string, any>) => Promise<boolean>;
  if ((batch.channel as Channel) === "email") {
    const cfg = requireEmail();
    const { data: sch } = await admin.from("schools").select("name, email").eq("id", batch.school_id).maybeSingle();
    const school = { name: (sch?.name as string) ?? "School", replyTo: normalizeEmail(String(sch?.email ?? "")) };
    const dry = !!batch.sandbox || cfg.sandbox;
    send = (m) => sendEmail(m, dry, school, cfg.from);
  } else {
    const sender = await requireSender(batch.school_id as string);
    const dry = !!batch.sandbox || apiConfig()?.forceSandbox === true;
    send = (m) => sendSms(m, dry, sender);
  }
  const started = Date.now();
  let sent = 0;
  let failed = 0;
  while (Date.now() - started < SEND_BUDGET_MS) {
    const { data: claimed } = await admin.rpc("claim_messages", { p_batch: batchId, p_limit: CLAIM_SIZE });
    if (!claimed || claimed.length === 0) break;
    await pool(claimed as Record<string, any>[], CONCURRENCY, async (m) => {
      if (await send(m)) sent++;
      else failed++;
    });
  }
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true })
    .eq("batch_id", batchId).in("status", ["queued", "sending"]);
  return { sent, failed, remaining: count ?? 0 };
}

// ─── Audience and message text ───────────────────────────────────────────────

interface Recipient {
  guardianId: string | null;
  staffId: string | null;
  studentId: string | null;
  name: string;
  phone: string;
  email: string;
  studentNames: string;
  className: string;
  balance: number;
}

async function loadAudience(schoolId: string, body: Record<string, unknown>, channel: Channel) {
  const audience = str(body.audience);
  if (!AUDIENCES.includes(audience)) throw new HttpError(400, "Choose who the message is for.");
  const classId = str(body.classId);
  if (audience === "class_parents" && !isUuid(classId)) throw new HttpError(400, "Choose a class.");

  const skipped = { noPhone: 0, badPhone: 0, duplicate: 0 };
  const addressOf = (r: Recipient) => (channel === "email" ? r.email : r.phone);
  const recipients: Recipient[] = [];
  const seen = new Set<string>();
  const add = (r: Recipient) => {
    const key = addressOf(r);
    if (seen.has(key)) { skipped.duplicate++; return; }
    seen.add(key);
    recipients.push(r);
  };

  if (audience === "custom") {
    const { valid, invalid, duplicates } = channel === "email"
      ? parseEmailList(str(body.customNumbers))
      : parseNumberList(str(body.customNumbers));
    skipped.badPhone += invalid.length;
    skipped.duplicate += duplicates;
    for (const a of valid) {
      add({
        guardianId: null, staffId: null, studentId: null, name: "", phone: channel === "sms" ? a : "", email: channel === "email" ? a : "",
        studentNames: "", className: "", balance: 0,
      });
    }
  } else {
    const { data, error } = await admin.rpc("messaging_audience", {
      p_school: schoolId, p_kind: audience, p_class: audience === "class_parents" ? classId : null, p_channel: channel,
    });
    if (error) throw new HttpError(500, "The recipients could not be loaded.");
    for (const r of (data ?? []) as Record<string, any>[]) {
      const phone = channel === "sms" ? normalizePhone(String(r.phone ?? "")) : "";
      const email = channel === "email" ? normalizeEmail(String(r.email ?? "")) : "";
      if (!(channel === "sms" ? phone : email)) { skipped.badPhone++; continue; }
      add({
        guardianId: r.guardian_id, staffId: r.staff_id, studentId: r.student_id, name: r.recipient_name ?? "",
        phone: phone ?? "", email: email ?? "", studentNames: r.student_names ?? "", className: r.class_name ?? "", balance: Number(r.balance ?? 0),
      });
    }
  }
  if (recipients.length > MAX_RECIPIENTS) throw new HttpError(400, `That is ${recipients.length} recipients; the limit is ${MAX_RECIPIENTS} per send.`);
  return { audience, classId: classId || null, recipients, skipped };
}

async function loadBody(schoolId: string, body: Record<string, unknown>, channel: Channel) {
  const key = str(body.templateKey);
  let text = str(body.body);
  let kind = "custom";
  if (!text && key) {
    const { data } = await admin.from("message_templates").select("body, key")
      .eq("school_id", schoolId).eq("key", key).eq("is_active", true).maybeSingle();
    if (!data) throw new HttpError(404, "That template was not found.");
    text = data.body;
  }
  if (key && text) kind = key;
  if (!text) throw new HttpError(400, "Write a message first.");
  const max = channel === "email" ? MAX_EMAIL_BODY : MAX_BODY;
  if (text.length > max) throw new HttpError(400, `The message is too long (${text.length} of ${max} characters).`);
  const subject = cleanHeader(str(body.subject));
  if (channel === "email" && !subject) throw new HttpError(400, "Write a subject for the email.");
  return { text, kind, subject };
}

function messageFor(template: string, r: Recipient, school: string, date: string) {
  return render(template, {
    parent: r.name || "Parent", student: r.studentNames, class: r.className, school,
    balance: r.balance > 0 ? formatMoney(r.balance) : "", date,
  });
}

const todayLabel = () =>
  new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });


// ─── The automatic sender ────────────────────────────────────────────────────
// A scheduler in the database calls this about once a minute, but only when automatic messages are waiting.
// It has no signed-in person: the call carries a shared secret (kept in the database's vault, never in the app),
// which this checks against the database before doing anything. It sends what the database queued when an event
// happened (an absence, a payment, a notice, a report), one batch at a time, through the same sending code a
// person's own send uses. Texts wait for the morning if it is night; anything waiting more than a day and a half
// is cancelled rather than sent late; a channel the school has since switched off is cancelled, not sent.
async function runTick(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const now = new Date();
  const { data: open } = await admin.from("messages").select("batch_id, created_at").like("kind", "auto\\_%").eq("status", "queued").limit(2000);
  const rows = (open ?? []) as { batch_id: string; created_at: string }[];
  // Too old to be useful: cancel.
  const stale = rows.filter((r) => isStale(r.created_at, now));
  if (stale.length > 0) {
    await admin.from("messages").update({ status: "cancelled", error: "Not sent: it waited too long to still be useful." })
      .like("kind", "auto\\_%").eq("status", "queued").lt("created_at", new Date(now.getTime() - 36 * 3600 * 1000).toISOString());
  }
  const batchIds = [...new Set(rows.filter((r) => !isStale(r.created_at, now)).map((r) => r.batch_id))];
  const out = { batches: batchIds.length, sent: 0, failed: 0, cancelled: stale.length, waiting: 0, problems: [] as string[] };
  for (const id of batchIds) {
    if (Date.now() - started > 90_000) { out.waiting += 1; continue; }
    const { data: b } = await admin.from("message_batches").select("school_id, channel").eq("id", id).maybeSingle();
    if (!b) continue;
    const school = b.school_id as string;
    const channel = b.channel as Channel;
    const on = (await admin.rpc("school_feature_enabled", { p_school: school, p_key: channel })).data !== false
      && (await admin.rpc("school_feature_enabled", { p_school: school, p_key: "messages" })).data !== false;
    if (!on) {
      await admin.from("messages").update({ status: "cancelled", error: "Not sent: this way of sending was switched off." }).eq("batch_id", id).eq("status", "queued");
      out.cancelled += 1;
      continue;
    }
    if (channel === "sms" && !withinSendingHours(now)) { out.waiting += 1; continue; }
    try {
      const r = await processBatch(id);
      out.sent += r.sent; out.failed += r.failed;
    } catch (e) {
      out.problems.push(e instanceof Error ? e.message : "unknown problem");
    }
  }
  return out;
}

// ─── Request handling ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    // The scheduler has no login: it proves itself with the shared secret held in the database.
    const tickSecret = req.headers.get("x-tick-secret");
    if (tickSecret) {
      const { data: expected } = await admin.rpc("messaging_tick_secret");
      if (typeof expected !== "string" || !expected || !sameSecret(tickSecret, expected)) throw new HttpError(401, "Not allowed.");
      return json(await runTick());
    }
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) throw new HttpError(401, "You are not signed in.");
    const me = auth.user;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action);

    const { data: profile } = await admin.from("profiles").select("school_id, is_active").eq("id", me.id).maybeSingle();
    if (!profile?.is_active) throw new HttpError(403, "Your account is not active.");
    const schoolId = profile.school_id as string;
    // What this person is allowed to do comes from the actions switched on for them (a developer
    // holds every action), not from a role name.
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("profile_id", me.id);
    const isDeveloper = (roleRows ?? []).some((r) => r.role === "developer");
    const { data: held } = await admin.from("user_capabilities").select("capability, expires_at").eq("profile_id", me.id);
    const holds = new Set((held ?? []).filter((r) => !r.expires_at || Date.parse(r.expires_at as string) > Date.now()).map((r) => r.capability as string));
    const can = (action: string) => isDeveloper || holds.has(action);
    const canSend = can("messages.send_all");
    const feeOnly = !canSend && can("messages.send_fee_reminders"); // may send fee reminders and nothing else
    const canManage = can("messages.manage_setup");
    if (!canSend && !feeOnly) throw new HttpError(403, "You do not have permission to send messages.");
    // The school may have switched text messages off altogether.
    const { data: smsOn } = await admin.rpc("school_feature_enabled", { p_school: profile.school_id as string, p_key: "messages" });
    if (smsOn === false) throw new HttpError(403, "Text messages are switched off for this school.");

    const { data: school } = await admin.from("schools").select("name").eq("id", schoolId).maybeSingle();
    const schoolName = (school?.name as string) ?? "School";

    // Each way of sending is its own switch. A message action names its channel (SMS unless it says email).
    const channel: Channel = str(body.channel) === "email" ? "email" : "sms";
    const channelOn = async (c: Channel) => (await admin.rpc("school_feature_enabled", { p_school: schoolId, p_key: c })).data !== false;
    async function assertChannelOn(c: Channel) {
      if (!(await channelOn(c))) throw new HttpError(403, c === "email" ? "Email is switched off for this school." : "Text messages are switched off for this school.");
    }

    function assertMayUse(audience: string) {
      if (feeOnly && audience !== "fee_balance") throw new HttpError(403, "You can only send fee reminders.");
    }

    // ── status: is SMS set up, and what is left on the account ───────────────
    if (action === "status" && channel === "email") {
      const cfg = emailConfig();
      const { data: sch } = await admin.from("schools").select("email").eq("id", schoolId).maybeSingle();
      return json({
        configured: cfg !== null, from: cfg?.from ?? null, sandboxForced: cfg?.sandbox === true,
        replyTo: normalizeEmail(String(sch?.email ?? "")), enabled: await channelOn("email"),
      });
    }
    if (action === "status") {
      const found = await senderFor(schoolId);
      const info = {
        keyPresent: apiConfig() !== null,
        sender: found?.sender ?? null,
        senderSource: found?.source ?? null,
        serverSender: Deno.env.get("ARKESEL_SENDER_ID")?.trim() || null,
        sandboxForced: apiConfig()?.forceSandbox === true,
      };
      if (!info.keyPresent || !found) return json({ configured: false, ...info });
      let balance: number | null = null;
      let balanceError: string | null = null;
      try {
        const r = await arkesel("/clients/balance-details");
        const d = (r.body?.data ?? r.body) as Record<string, any>;
        const raw = d?.sms_balance ?? d?.balance ?? d?.main_balance ?? r.body?.balance;
        const n = Number(raw);
        if (r.status >= 200 && r.status < 300 && Number.isFinite(n)) balance = n;
        else balanceError = friendlyProviderError(String(r.body?.message ?? `HTTP ${r.status}`));
      } catch {
        balanceError = "Arkesel could not be reached.";
      }
      return json({ configured: true, ...info, balance, balanceError });
    }

    // ── preview: who would get it, and exactly what they would read ──────────
    if (action === "preview") {
      assertMayUse(str(body.audience));
      await assertChannelOn(channel);
      const a = await loadAudience(schoolId, body, channel);
      const msg = await loadBody(schoolId, body, channel);
      const date = todayLabel();
      const sample = a.recipients.slice(0, 3).map((r) => {
        const text = messageFor(msg.text, r, schoolName, date);
        return {
          name: r.name, phone: r.phone, email: r.email, text, segments: countSegments(text).segments,
          subject: channel === "email" ? cleanHeader(messageFor(msg.subject, r, schoolName, date)) : null,
        };
      });
      const parts = channel === "email"
        ? a.recipients.length
        : a.recipients.reduce((n, r) => n + countSegments(messageFor(msg.text, r, schoolName, date)).segments, 0);
      return json({ count: a.recipients.length, parts, skipped: a.skipped, sample, channel });
    }

    // ── send ──────────────────────────────────────────────────────────────────
    if (action === "send") {
      assertMayUse(str(body.audience));
      await assertChannelOn(channel);
      if (channel === "email") requireEmail();
      else { requireKey(); await requireSender(schoolId); }
      const a = await loadAudience(schoolId, body, channel);
      const msg = await loadBody(schoolId, body, channel);
      if (a.recipients.length === 0) throw new HttpError(400, "There is nobody to send this to.");
      const sandbox = body.sandbox === true;

      const { data: batch, error: batchError } = await admin.from("message_batches").insert({
        school_id: schoolId, title: str(body.title) || msg.kind, kind: msg.kind, audience: a.audience,
        class_id: a.classId, body_template: msg.text, sandbox, created_by: me.id, channel,
        subject: channel === "email" ? msg.subject : null,
      }).select("id").single();
      if (batchError || !batch) throw new HttpError(500, "The send could not be started.");

      const date = todayLabel();
      const rows = a.recipients.map((r) => {
        const text = messageFor(msg.text, r, schoolName, date);
        return {
          school_id: schoolId, batch_id: batch.id, kind: msg.kind, recipient_name: r.name || null, channel,
          recipient_phone: channel === "sms" ? r.phone : null, recipient_email: channel === "email" ? r.email : null,
          subject: channel === "email" ? cleanHeader(messageFor(msg.subject, r, schoolName, date)) : null,
          guardian_id: r.guardianId, staff_id: r.staffId, student_id: r.studentId, body: text,
          segments: channel === "email" ? 1 : Math.max(countSegments(text).segments, 1), created_by: me.id,
        };
      });
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await admin.from("messages").insert(rows.slice(i, i + 500));
        if (error) throw new HttpError(500, "The messages could not be queued.");
      }
      const result = await processBatch(batch.id);
      return json({ batchId: batch.id, total: rows.length, skipped: a.skipped, ...result });
    }

    // ── process: carry on with a batch that did not finish ───────────────────
    if (action === "process") {
      const batchId = str(body.batchId);
      if (!isUuid(batchId)) throw new HttpError(400, "Invalid batch.");
      const { data: b } = await admin.from("message_batches").select("school_id, audience, channel").eq("id", batchId).maybeSingle();
      if (!b || b.school_id !== schoolId) throw new HttpError(404, "Batch not found.");
      assertMayUse(b.audience as string);
      await assertChannelOn(b.channel as Channel);
      if (b.channel === "email") requireEmail(); else requireKey();
      return json({ batchId, ...(await processBatch(batchId)) });
    }

    // ── refresh: ask Arkesel what became of the messages already sent ────────
    if (action === "refresh") {
      const batchId = str(body.batchId);
      let q = admin.from("messages").select("id, provider_message_id, provider_response, batch_id, channel")
        .eq("school_id", schoolId).eq("status", "sent").not("provider_message_id", "is", null)
        .lt("sent_at", new Date(Date.now() - 20_000).toISOString()).limit(100);
      if (isUuid(batchId)) q = q.eq("batch_id", batchId);
      const { data: open } = await q;
      const sandboxBatches = new Set<string>();
      const ids = [...new Set((open ?? []).map((m) => m.batch_id as string))];
      if (ids.length) {
        const { data: bs } = await admin.from("message_batches").select("id, sandbox").in("id", ids);
        for (const b of bs ?? []) if (b.sandbox) sandboxBatches.add(b.id as string);
      }
      let delivered = 0;
      let failed = 0;
      const toCheck = (open ?? []).filter((m) => !sandboxBatches.has(m.batch_id as string));
      if (toCheck.some((m) => m.channel === "email")) requireEmail();
      if (toCheck.some((m) => m.channel !== "email")) requireKey();
      await pool(toCheck, 4, async (m) => {
        try {
          if (m.channel === "email") {
            // Resend reports the latest thing that happened to the email.
            const r = await resend(`/emails/${encodeURIComponent(m.provider_message_id as string)}`);
            const state = String(r.body?.last_event ?? "").toLowerCase();
            const patch: Record<string, unknown> = { provider_response: { send: m.provider_response, status: r.body } };
            if (/bounce|complain|fail|reject/.test(state)) { patch.status = "failed"; patch.error = state.includes("complain") ? "The recipient marked it as spam." : `Not delivered (${state}).`; failed++; }
            else if (/deliver/.test(state) && !/delay/.test(state)) { patch.status = "delivered"; patch.delivered_at = new Date().toISOString(); delivered++; }
            await admin.from("messages").update(patch).eq("id", m.id);
            return;
          }
          const r = await arkesel(`/sms/${encodeURIComponent(m.provider_message_id as string)}`);
          const d = (r.body?.data ?? r.body) as Record<string, any>;
          const state = String(d?.status ?? d?.delivery_status ?? "").toLowerCase();
          const patch: Record<string, unknown> = { provider_response: { send: m.provider_response, status: r.body } };
          if (/undeliver|fail|reject|expire/.test(state)) { patch.status = "failed"; patch.error = `Not delivered (${state}).`; failed++; }
          else if (/deliver/.test(state)) { patch.status = "delivered"; patch.delivered_at = new Date().toISOString(); delivered++; }
          await admin.from("messages").update(patch).eq("id", m.id);
        } catch { /* try again on the next refresh */ }
      });
      return json({ checked: toCheck.length, delivered, failed });
    }

    // ── retry: put failed messages back in the queue (never ones that may have sent) ─
    if (action === "retry") {
      const batchId = str(body.batchId);
      if (!isUuid(batchId)) throw new HttpError(400, "Invalid batch.");
      const { data: b } = await admin.from("message_batches").select("school_id, audience, channel").eq("id", batchId).maybeSingle();
      if (!b || b.school_id !== schoolId) throw new HttpError(404, "Batch not found.");
      assertMayUse(b.audience as string);
      await assertChannelOn(b.channel as Channel);
      const { data: requeued } = await admin.from("messages").update({ status: "queued", error: null })
        .eq("batch_id", batchId).eq("status", "failed").is("provider_message_id", null)
        .not("error", "ilike", "Interrupted%").lt("attempts", 3).select("id");
      return json({ requeued: requeued?.length ?? 0 });
    }

    // ── test: one message to one number, showing what Arkesel answered ───────
    if (action === "test") {
      if (!canManage) throw new HttpError(403, "You do not have permission to send a test message.");
      await assertChannelOn(channel);
      const isEmail = channel === "email";
      if (isEmail) requireEmail();
      else { requireKey(); await requireSender(schoolId); }
      const phone = isEmail ? null : normalizePhone(str(body.to));
      const address = isEmail ? normalizeEmail(str(body.to)) : null;
      if (isEmail ? !address : !phone) throw new HttpError(400, isEmail ? "That email address does not look right." : "That phone number does not look right.");
      const text = str(body.body) || `${schoolName}: this is a test message.`;
      const max = isEmail ? MAX_EMAIL_BODY : MAX_BODY;
      if (text.length > max) throw new HttpError(400, "The message is too long.");
      const sandbox = body.sandbox === true;
      const subject = isEmail ? cleanHeader(str(body.subject)) || `Test email from ${schoolName}` : null;

      const { data: batch } = await admin.from("message_batches").insert({
        school_id: schoolId, title: isEmail ? "Test email" : "Test message", kind: "test", audience: "custom",
        body_template: text, sandbox, created_by: me.id, channel, subject,
      }).select("id").single();
      const { data: row } = await admin.from("messages").insert({
        school_id: schoolId, batch_id: batch!.id, kind: "test", channel, recipient_phone: phone, recipient_email: address, subject,
        body: text, segments: isEmail ? 1 : Math.max(countSegments(text).segments, 1), created_by: me.id,
      }).select("id").single();
      await processBatch(batch!.id);
      const { data: result } = await admin.from("messages").select("status, error, provider_message_id, provider_response")
        .eq("id", row!.id).maybeSingle();
      const forced = isEmail ? emailConfig()?.sandbox === true : apiConfig()?.forceSandbox === true;
      return json({ sandbox: sandbox || forced, ...result });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e instanceof Error ? e.message : "error");
    return json({ error: "Something went wrong." }, 500);
  }
});
