// Complaints. The database decides who may see what and never hands a handler the person behind an
// anonymous complaint; these calls ask.
import { supabase } from "../supabase";
import type { Category, ComplaintStatus } from "../complaints";

export async function submitComplaint(category: Category, subject: string, body: string, anonymous: boolean): Promise<{ id: string; ref: string }> {
  const { data, error } = await supabase.rpc("submit_complaint", { p_category: category, p_subject: subject, p_body: body, p_anonymous: anonymous });
  if (error) throw error;
  return data as { id: string; ref: string };
}

// ─── The person who complained ───────────────────────────────────────────────

export interface MyComplaint { id: string; ref: string; category: Category; subject: string; body: string; anonymous: boolean; status: ComplaintStatus; createdAt: string; lastActivityAt: string }

export async function listMyComplaints(): Promise<MyComplaint[]> {
  const { data, error } = await supabase.rpc("my_complaints");
  if (error) throw error;
  return ((data ?? []) as { id: string; ref: string; category: Category; subject: string; body: string; anonymous: boolean; status: ComplaintStatus; created_at: string; last_activity_at: string }[])
    .map((r) => ({ id: r.id, ref: r.ref, category: r.category, subject: r.subject, body: r.body, anonymous: r.anonymous, status: r.status, createdAt: r.created_at, lastActivityAt: r.last_activity_at }));
}

export interface MyMessage { id: string; fromHandler: boolean; body: string; createdAt: string }

export async function getMyThread(id: string): Promise<MyMessage[]> {
  const { data, error } = await supabase.rpc("my_complaint_thread", { p_id: id });
  if (error) throw error;
  return ((data ?? []) as { id: string; from_handler: boolean; body: string; created_at: string }[]).map((r) => ({ id: r.id, fromHandler: r.from_handler, body: r.body, createdAt: r.created_at }));
}

export async function replyAsComplainant(id: string, body: string): Promise<void> {
  const { error } = await supabase.rpc("reply_to_complaint", { p_id: id, p_body: body });
  if (error) throw error;
}

// ─── Those who handle complaints ─────────────────────────────────────────────

export interface Complaint {
  id: string; ref: string; category: Category; subject: string; body: string; anonymous: boolean; submitterName: string | null; status: ComplaintStatus;
  assignedTo: string | null; assignedName: string | null; createdAt: string; lastActivityAt: string; messages: number;
}

export async function listComplaints(): Promise<Complaint[]> {
  const { data, error } = await supabase.rpc("complaints_list");
  if (error) throw error;
  return ((data ?? []) as { id: string; ref: string; category: Category; subject: string; body: string; anonymous: boolean; submitter_name: string | null; status: ComplaintStatus;
    assigned_to: string | null; assigned_name: string | null; created_at: string; last_activity_at: string; messages: number }[])
    .map((r) => ({ id: r.id, ref: r.ref, category: r.category, subject: r.subject, body: r.body, anonymous: r.anonymous, submitterName: r.submitter_name, status: r.status,
      assignedTo: r.assigned_to, assignedName: r.assigned_name, createdAt: r.created_at, lastActivityAt: r.last_activity_at, messages: r.messages }));
}

export interface ThreadMessage { id: string; fromHandler: boolean; internal: boolean; authorName: string | null; body: string; createdAt: string }

export async function getThread(id: string): Promise<ThreadMessage[]> {
  const { data, error } = await supabase.rpc("complaint_thread", { p_id: id });
  if (error) throw error;
  return ((data ?? []) as { id: string; from_handler: boolean; internal: boolean; author_name: string | null; body: string; created_at: string }[])
    .map((r) => ({ id: r.id, fromHandler: r.from_handler, internal: r.internal, authorName: r.author_name, body: r.body, createdAt: r.created_at }));
}

export interface HistoryItem { actorName: string | null; action: string; detail: string | null; at: string }

export async function getHistory(id: string): Promise<HistoryItem[]> {
  const { data, error } = await supabase.rpc("complaint_history", { p_id: id });
  if (error) throw error;
  return ((data ?? []) as { actor_name: string | null; action: string; detail: string | null; at: string }[]).map((r) => ({ actorName: r.actor_name, action: r.action, detail: r.detail, at: r.at }));
}

export async function handlerReply(id: string, body: string, internal: boolean): Promise<void> {
  const { error } = await supabase.rpc("handle_reply", { p_id: id, p_body: body, p_internal: internal });
  if (error) throw error;
}

export async function setComplaintStatus(id: string, status: ComplaintStatus): Promise<void> {
  const { error } = await supabase.rpc("set_complaint_status", { p_id: id, p_status: status });
  if (error) throw error;
}

export async function assignComplaint(id: string, profileId: string | null): Promise<void> {
  const { error } = await supabase.rpc("assign_complaint", { p_id: id, p_profile: profileId });
  if (error) throw error;
}

export async function listHandlers(id: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc("complaint_handlers_list", { p_id: id });
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string }[]).map((r) => ({ id: r.id, name: r.full_name }));
}

// ─── The last resort (developer only) ────────────────────────────────────────

export interface Revealed { name: string; email: string | null; roles: string[] }

export async function revealSubmitter(id: string, reason: string): Promise<Revealed> {
  const { data, error } = await supabase.rpc("reveal_complaint_submitter", { p_id: id, p_reason: reason });
  if (error) throw error;
  return data as Revealed;
}

export interface RevealEntry { id: string; ref: string; subject: string; revealedBy: string | null; reason: string; at: string }

export async function listReveals(): Promise<RevealEntry[]> {
  const { data, error } = await supabase.rpc("complaint_reveals_list");
  if (error) throw error;
  return ((data ?? []) as { id: string; ref: string; subject: string; revealed_by_name: string | null; reason: string; at: string }[])
    .map((r) => ({ id: r.id, ref: r.ref, subject: r.subject, revealedBy: r.revealed_by_name, reason: r.reason, at: r.at }));
}
