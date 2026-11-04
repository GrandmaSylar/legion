// In-app notifications. The database writes them (when a notice is published, a payment is received,
// a pupil is marked absent, report cards are published); a person can only read their own and mark
// them read. Which events notify is a school setting.
import { supabase } from "../supabase";

export interface AppNotification {
  id: string;
  event: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, event, title, body, link, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((n) => ({
    id: n.id, event: n.event, title: n.title, body: n.body, link: n.link, createdAt: n.created_at, readAt: n.read_at,
  }));
}

export async function countUnread(): Promise<number> {
  const { count, error } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(id: string): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(): Promise<void> {
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (error) throw error;
}

// ─── What a school chooses to be told about ─────────────────────────────────

export interface NotificationEventDef {
  key: string;
  label: string;
  description: string;
  feature: string | null;
  /** Whether this event can also go to parents by text message and email. */
  canMessage: boolean;
}

export async function listNotificationEvents(): Promise<NotificationEventDef[]> {
  const { data, error } = await supabase.from("notification_events").select("key, label, description, feature, can_message").order("sort");
  if (error) throw error;
  return ((data ?? []) as { key: string; label: string; description: string; feature: string | null; can_message: boolean }[])
    .map((r) => ({ key: r.key, label: r.label, description: r.description, feature: r.feature, canMessage: r.can_message }));
}

/** The events a school has switched off. An event with no saved choice is on. */
export async function listDisabledNotificationEvents(): Promise<string[]> {
  const { data, error } = await supabase.from("notification_settings").select("event").eq("enabled", false);
  if (error) throw error;
  return (data ?? []).map((r) => r.event as string);
}

export async function setNotificationEvent(event: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from("notification_settings")
    .upsert({ event, enabled, updated_at: new Date().toISOString() }, { onConflict: "school_id,event" });
  if (error) throw error;
}

// ─── Sending these as text messages and email ───────────────────────────────

export type AutoChannel = "sms" | "email";

/** Which events a school has switched on for text messages and for email. Every one starts off. */
export async function listChannelSwitches(): Promise<Record<string, { sms: boolean; email: boolean }>> {
  const { data, error } = await supabase.from("notification_settings").select("event, sms_enabled, email_enabled");
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as { event: string; sms_enabled: boolean; email_enabled: boolean }[]).map((r) => [r.event, { sms: r.sms_enabled, email: r.email_enabled }]));
}

export async function setChannelSwitch(event: string, channel: AutoChannel, on: boolean): Promise<void> {
  const column = channel === "sms" ? "sms_enabled" : "email_enabled";
  const existing = await supabase.from("notification_settings").select("event").eq("event", event).maybeSingle();
  if (existing.error) throw existing.error;
  // Change only the one switch: never touch whether the bell notification itself is on.
  const res = existing.data
    ? await supabase.from("notification_settings").update({ [column]: on, updated_at: new Date().toISOString() }).eq("event", event)
    : await supabase.from("notification_settings").insert({ event, enabled: true, [column]: on });
  if (res.error) throw res.error;
}

export interface AutoStatus { scheduled: boolean; queued: number; sentToday: number; failedToday: number; dailyLimit: number }

export async function getAutoStatus(): Promise<AutoStatus> {
  const { data, error } = await supabase.rpc("auto_message_status");
  if (error) throw error;
  return data as AutoStatus;
}

export async function setAutoLimit(limit: number): Promise<void> {
  const { error } = await supabase.from("auto_message_settings").upsert({ daily_limit: limit, updated_at: new Date().toISOString() }, { onConflict: "school_id" });
  if (error) throw error;
}
