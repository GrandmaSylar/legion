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
}

export async function listNotificationEvents(): Promise<NotificationEventDef[]> {
  const { data, error } = await supabase.from("notification_events").select("key, label, description, feature").order("sort");
  if (error) throw error;
  return (data ?? []) as NotificationEventDef[];
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
