// paystack: take school fees online through Paystack.
//
// The browser never sees the secret key and never records a payment. This function
//   - starts a payment for an invoice the caller is allowed to see (their own
//     child's, enforced by the database's row level security, not by this code),
//   - confirms the result with Paystack when the parent returns to the app,
//   - and receives Paystack's webhook, trusting it only when its HMAC signature
//     matches, so the payment is recorded even if the parent closes the tab.
// A payment becomes a real row only through record_online_payment(), which checks
// the amount, ignores repeats and is callable by the service role alone.
//
// Deploy WITHOUT gateway JWT verification (Paystack sends no Supabase token):
//   supabase functions deploy paystack --use-api --no-verify-jwt
// Every path authenticates itself: a signed-in user's token, or Paystack's signature.
//
// Secrets: PAYSTACK_SECRET_KEY (sk_test_... or sk_live_...), and APP_URL, the address
// the app is served from (comma-separated for several). localhost is always allowed
// so development works. Paystack redirects the parent back to <APP_URL>/fees.
import { createClient } from "npm:@supabase/supabase-js@2";

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

const PAYSTACK = "https://api.paystack.co";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const secretKey = () => Deno.env.get("PAYSTACK_SECRET_KEY")?.trim() || null;
const modeOf = (key: string) => (key.startsWith("sk_live_") ? "live" : "test");

function requireKey(): string {
  const key = secretKey();
  if (!key) throw new HttpError(503, "Online payments are not set up yet. The Paystack key has not been added to the server.");
  return key;
}

async function paystack(path: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${PAYSTACK}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${requireKey()}`, "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { ok: res.ok && body.status === true, status: res.status, body };
}

// ── helpers ─────────────────────────────────────────────────────────────────

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Paystack signs the raw request body with the secret key (HMAC SHA-512). */
async function validSignature(raw: string, signature: string): Promise<boolean> {
  const key = secretKey();
  if (!key || !signature) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw)));
  if (expected.length !== signature.length) return false;
  let diff = 0; // compare every character so timing reveals nothing
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/** The app address Paystack may send the parent back to: configured, or local development. */
function allowedOrigin(value: string): string | null {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return null;
  }
  const configured = (Deno.env.get("APP_URL") ?? "").split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
  if (configured.includes(u.origin)) return u.origin;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return u.origin;
  return null;
}

const money = (n: number) => Math.round(n * 100) / 100;

async function invoiceBalance(invoiceId: string): Promise<number> {
  const { data: items } = await admin.from("invoice_items").select("amount").eq("invoice_id", invoiceId);
  const { data: pays } = await admin.from("payments").select("amount").eq("invoice_id", invoiceId).is("voided_at", null);
  const billed = (items ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const paid = (pays ?? []).reduce((s, r) => s + Number(r.amount), 0);
  return money(billed - paid);
}

/** Records a successful charge. Returns the receipt number, or a reason it needs review. */
async function record(reference: string, data: Record<string, any>) {
  const { data: paymentId, error } = await admin.rpc("record_online_payment", {
    p_reference: reference,
    p_paid: money(Number(data.amount) / 100),
    p_channel: str(data.channel),
    p_network: str(data.authorization?.bank) || str(data.authorization?.brand),
    p_raw: data,
  });
  if (error) {
    if (error.code === "P0002") return { found: false as const };
    throw new Error(error.message);
  }
  if (!paymentId) {
    const { data: op } = await admin.from("online_payments").select("note").eq("reference", reference).maybeSingle();
    return { found: true as const, review: (op?.note as string) ?? "This payment needs to be reviewed by the school." };
  }
  const { data: pay } = await admin.from("payments").select("receipt_no").eq("id", paymentId).maybeSingle();
  return { found: true as const, receiptNo: (pay?.receipt_no as string) ?? null };
}

// ── webhook ─────────────────────────────────────────────────────────────────

async function handleWebhook(raw: string, signature: string): Promise<Response> {
  if (!(await validSignature(raw, signature))) return json({ error: "Invalid signature." }, 401);
  const event = JSON.parse(raw) as { event?: string; data?: Record<string, any> };
  if (event.event === "charge.success" && event.data?.reference) {
    const r = await record(String(event.data.reference), event.data);
    // An unknown reference belongs to something else on the same Paystack account; acknowledge it.
    if (!r.found) console.log("paystack webhook: unknown reference", event.data.reference);
  }
  return json({ ok: true });
}

// ── entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const raw = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    if (signature) return await handleWebhook(raw, signature);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /i, "");
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) throw new HttpError(401, "You are not signed in.");
    const me = auth.user;
    const { data: profile } = await admin.from("profiles").select("is_active").eq("id", me.id).maybeSingle();
    if (!profile?.is_active) throw new HttpError(403, "Your account is not active.");

    let body: Record<string, unknown> = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new HttpError(400, "That request could not be read.");
    }
    const action = str(body.action);

    // What the caller's own database permissions allow them to see.
    const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    // ── status: can parents pay online right now? ───────────────────────────
    if (action === "status") {
      const key = secretKey();
      return json({ configured: !!key, mode: key ? modeOf(key) : null });
    }

    // ── initialize: start a payment for one invoice ─────────────────────────
    if (action === "initialize") {
      requireKey();
      const invoiceId = str(body.invoiceId);
      const origin = allowedOrigin(str(body.returnUrl));
      if (!origin) throw new HttpError(400, "That return address is not allowed.");
      if (!me.email) throw new HttpError(400, "Your login has no email address, which Paystack requires.");

      const { data: inv } = await asUser
        .from("invoices")
        .select("id, school_id, number, status, deleted_at, students(first_name, last_name)")
        .eq("id", invoiceId)
        .maybeSingle();
      if (!inv || inv.deleted_at) throw new HttpError(404, "That invoice was not found.");
      if (inv.status === "void") throw new HttpError(400, "That invoice has been cancelled.");

      const balance = await invoiceBalance(invoiceId);
      if (balance <= 0) throw new HttpError(400, "That invoice is already paid.");
      const amount = body.amount == null || body.amount === "" ? balance : money(Number(body.amount));
      if (!Number.isFinite(amount) || amount < 1) throw new HttpError(400, "The smallest payment is GHS 1.00.");
      if (amount > balance) throw new HttpError(400, `That is more than the balance of GHS ${balance.toFixed(2)}.`);

      const reference = `PA${Date.now().toString(36)}${crypto.randomUUID().replaceAll("-", "").slice(0, 10)}`.toUpperCase();
      const { error: insertError } = await admin.from("online_payments").insert({
        school_id: inv.school_id,
        invoice_id: invoiceId,
        initiated_by: me.id,
        reference,
        amount,
      });
      if (insertError) throw new Error(insertError.message);

      const student = inv.students as unknown as { first_name: string; last_name: string } | null;
      const r = await paystack("/transaction/initialize", {
        method: "POST",
        body: {
          email: me.email,
          amount: Math.round(amount * 100), // Paystack counts in pesewas
          currency: "GHS",
          reference,
          callback_url: `${origin}/fees`,
          metadata: {
            invoice_id: invoiceId,
            invoice_number: inv.number,
            student: student ? `${student.first_name} ${student.last_name}` : undefined,
          },
        },
      });
      if (!r.ok || !r.body.data?.authorization_url) {
        await admin.from("online_payments").delete().eq("reference", reference);
        throw new HttpError(502, `Paystack could not start the payment${r.body.message ? `: ${r.body.message}` : "."}`);
      }
      return json({ authorizationUrl: r.body.data.authorization_url as string, reference, amount });
    }

    // ── verify: the parent is back; ask Paystack what happened ──────────────
    if (action === "verify") {
      requireKey();
      const reference = str(body.reference);
      const { data: op } = await asUser.from("online_payments").select("reference, status, invoice_id").eq("reference", reference).maybeSingle();
      if (!op) throw new HttpError(404, "That payment was not found.");
      if (op.status === "success") {
        const { data: row } = await admin.from("online_payments").select("payment_id").eq("reference", reference).single();
        const { data: pay } = await admin.from("payments").select("receipt_no").eq("id", row.payment_id).maybeSingle();
        return json({ status: "success", receiptNo: pay?.receipt_no ?? null });
      }
      const r = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (!r.ok) return json({ status: "pending" });
      const data = r.body.data as Record<string, any>;
      if (data.status === "success") {
        const rec = await record(reference, data);
        if (!rec.found) throw new HttpError(404, "That payment was not found.");
        if ("review" in rec) return json({ status: "review", message: rec.review });
        return json({ status: "success", receiptNo: rec.receiptNo });
      }
      if (data.status === "failed" || data.status === "reversed") {
        await admin.from("online_payments").update({ status: "failed", provider_response: data }).eq("reference", reference).neq("status", "success");
        return json({ status: "failed", message: str(data.gateway_response) || "The payment did not go through." });
      }
      return json({ status: "pending" }); // still ongoing, or the parent left without paying
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error("paystack error", e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
