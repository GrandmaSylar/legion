// Data layer for messaging by SMS and email. Sending goes through the `messaging` Edge Function
// (which holds the provider keys and decides the recipients); reading the log and
// editing templates goes through the database, where row level security applies.
import { supabase } from "../supabase";
import { invokeFunction } from "./functions";

export type Audience =
  | "all_parents" | "class_parents" | "fee_balance" | "absent_today" | "staff" | "teachers" | "custom";

export const AUDIENCE_LABELS: Record<Audience, string> = {
  all_parents: "All parents and guardians",
  class_parents: "Parents of one class",
  fee_balance: "Parents who owe fees",
  absent_today: "Parents of pupils absent today",
  staff: "All staff",
  teachers: "Teachers only",
  custom: "Phone numbers I type in",
};

export type Channel = "sms" | "email";

export const CHANNEL_LABELS: Record<Channel, string> = { sms: "Text message (SMS)", email: "Email" };

export type MessageStatus = "queued" | "sending" | "sent" | "delivered" | "failed" | "cancelled";

// ─── Provider status ─────────────────────────────────────────────────────────

export interface SmsStatus {
  configured: boolean;
  keyPresent?: boolean;
  sender?: string | null;
  senderSource?: "school" | "server" | null;
  serverSender?: string | null;
  sandboxForced?: boolean;
  balance?: number | null;
  balanceError?: string | null;
}

export const getSmsStatus = () => invokeFunction<SmsStatus>("messaging", { action: "status" });

export interface EmailStatus {
  configured: boolean;
  /** The PhiNova address emails are sent from. */
  from: string | null;
  sandboxForced: boolean;
  /** The school's own email, where replies go. Null when the school has not set one. */
  replyTo: string | null;
  enabled: boolean;
}

export const getEmailStatus = () => invokeFunction<EmailStatus>("messaging", { action: "status", channel: "email" });

/** The school's own sender ID, or null when it relies on the server-wide one. */
export async function getSenderSetting(): Promise<string | null> {
  const { data, error } = await supabase.from("message_settings").select("sender_id").maybeSingle();
  if (error) throw error;
  return (data?.sender_id as string | null) ?? null;
}

/** Saves the sender ID (3 to 11 letters or digits); an empty value goes back to the server default. */
export async function saveSenderSetting(senderId: string): Promise<void> {
  const value = senderId.trim();
  if (value && !/^[A-Za-z0-9]{3,11}$/.test(value)) {
    throw new Error("A sender ID is 3 to 11 letters or numbers, with no spaces or symbols.");
  }
  const { error } = await supabase.from("message_settings").upsert({ sender_id: value || null }, { onConflict: "school_id" });
  if (error) throw error;
}

// ─── Preview and send ────────────────────────────────────────────────────────

export interface Draft {
  channel?: Channel;
  /** Email only. Placeholders such as {student} work here too. */
  subject?: string;
  audience: Audience;
  classId?: string;
  customNumbers?: string;
  templateKey?: string;
  body: string;
}

export interface Preview {
  count: number;
  /** Total SMS parts across everyone, which is what is billed. */
  parts: number;
  skipped: { noPhone: number; badPhone: number; duplicate: number };
  sample: { name: string; phone: string; email: string; subject: string | null; text: string; segments: number }[];
}

export const previewMessage = (d: Draft) => invokeFunction<Preview>("messaging", { action: "preview", ...d });

export interface SendResult {
  batchId: string;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
}

export const sendMessage = (d: Draft & { title?: string; sandbox: boolean }) =>
  invokeFunction<SendResult>("messaging", { action: "send", ...d });

/** Carry on with a batch the first call did not finish. */
export const continueBatch = (batchId: string) =>
  invokeFunction<{ sent: number; failed: number; remaining: number }>("messaging", { action: "process", batchId });

export const refreshDelivery = (batchId?: string) =>
  invokeFunction<{ checked: number; delivered: number; failed: number }>("messaging", { action: "refresh", batchId });

export const retryFailed = (batchId: string) =>
  invokeFunction<{ requeued: number }>("messaging", { action: "retry", batchId });

export interface TestResult {
  sandbox: boolean;
  status: MessageStatus;
  error: string | null;
  provider_message_id: string | null;
  provider_response: unknown;
}

export const sendTest = (to: string, body: string, sandbox: boolean, channel: Channel = "sms", subject?: string) =>
  invokeFunction<TestResult>("messaging", { action: "test", to, body, sandbox, channel, subject });

// ─── History ─────────────────────────────────────────────────────────────────

export interface BatchRow {
  id: string;
  title: string;
  kind: string;
  audience: Audience;
  channel: Channel;
  sandbox: boolean;
  createdAt: string;
  total: number;
  queued: number;
  sent: number;
  delivered: number;
  failed: number;
}

export async function listBatches(limit = 50): Promise<BatchRow[]> {
  const { data, error } = await supabase.rpc("message_batch_stats", { p_limit: limit });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.batch_id as string,
    title: r.title as string,
    kind: r.kind as string,
    audience: r.audience as Audience,
    channel: ((r.channel as Channel | null) ?? "sms"),
    sandbox: r.sandbox as boolean,
    createdAt: r.created_at as string,
    total: Number(r.total),
    queued: Number(r.queued),
    sent: Number(r.sent),
    delivered: Number(r.delivered),
    failed: Number(r.failed),
  }));
}

export interface MessageRow {
  id: string;
  recipientName: string | null;
  channel: Channel;
  /** The phone number for a text message, the email address for an email. */
  phone: string;
  subject: string | null;
  body: string;
  segments: number;
  status: MessageStatus;
  error: string | null;
  sentAt: string | null;
}

export async function listMessages(batchId: string): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, recipient_name, recipient_phone, recipient_email, channel, subject, body, segments, status, error, sent_at")
    .eq("batch_id", batchId)
    .order("created_at")
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((m) => ({
    id: m.id,
    recipientName: m.recipient_name,
    channel: (m.channel as Channel) ?? "sms",
    phone: (m.channel === "email" ? m.recipient_email : m.recipient_phone) ?? "",
    subject: m.subject,
    body: m.body,
    segments: m.segments,
    status: m.status as MessageStatus,
    error: m.error,
    sentAt: m.sent_at,
  }));
}

// ─── Templates ───────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  key: string;
  name: string;
  body: string;
  isSystem: boolean;
  isActive: boolean;
}

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, key, name, body, is_system, is_active")
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t) => ({
    id: t.id, key: t.key, name: t.name, body: t.body, isSystem: t.is_system, isActive: t.is_active,
  }));
}

export async function saveTemplate(t: { id?: string; name: string; body: string }) {
  if (t.id) {
    const { error } = await supabase.from("message_templates").update({ name: t.name, body: t.body }).eq("id", t.id);
    if (error) throw error;
    return;
  }
  // A custom template gets a key made from its name, made unique if it already exists.
  const base = t.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "custom";
  const key = `${base}_${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await supabase.from("message_templates").insert({ key, name: t.name, body: t.body });
  if (error) throw error;
}

export async function deleteTemplate(id: string) {
  const { data, error } = await supabase.from("message_templates").delete().eq("id", id).eq("is_system", false).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw { code: "42501" };
}
