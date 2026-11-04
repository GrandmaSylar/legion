// Staff clock-in. The database holds the secret, makes and checks the codes, flags odd cases and decides who
// may see what; these calls ask. The one thing kept on the phone is a random id that stands for the phone
// itself, and a short queue of scans made with no signal.
import { supabase } from "../supabase";
import { cleanCode, enqueue, prune, type QueuedScan } from "../clockin";

export type ClockMode = "self" | "taker" | "both";

export interface ClockConfig { mode: ClockMode; workStart: string; graceMinutes: number; workEnd: string; isTaker: boolean; today: string }

export async function getClockConfig(): Promise<ClockConfig> {
  const { data, error } = await supabase.rpc("clockin_config");
  if (error) throw error;
  return data as ClockConfig;
}

export async function saveClockSettings(mode: ClockMode, workStart: string, grace: number, workEnd: string): Promise<void> {
  const { error } = await supabase.rpc("save_clockin_settings", { p_mode: mode, p_work_start: workStart, p_grace: grace, p_work_end: workEnd });
  if (error) throw error;
}

export async function rotateClockSecret(): Promise<void> {
  const { error } = await supabase.rpc("rotate_clockin_secret");
  if (error) throw error;
}

export interface ShownCode { code: string; expiresIn: number; windowSeconds: number }

export async function getCurrentCode(): Promise<ShownCode> {
  const { data, error } = await supabase.rpc("clockin_current_code");
  if (error) throw error;
  return data as ShownCode;
}

// ─── This phone ──────────────────────────────────────────────────────────────

const DEVICE_KEY = "legion.clockin.device";
const QUEUE_KEY = "legion.clockin.queue";

/** A random id for this phone, made once and kept. Clearing the browser's data makes the phone look new. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || id.length < 16) {
      id = crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "volatile-" + crypto.randomUUID();
  }
}

const deviceLabel = () => (navigator.userAgent.match(/\(([^)]+)\)/)?.[1] ?? "phone").slice(0, 80);

export function readQueue(): QueuedScan[] {
  try { return prune(JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedScan[], Date.now()); } catch { return []; }
}
function writeQueue(q: QueuedScan[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch { /* storage unavailable: the scan is simply not kept */ }
}

// ─── Clocking in ─────────────────────────────────────────────────────────────

export interface ClockResult { ok: boolean; kind?: "in" | "out"; duplicate?: boolean; flags?: string[]; at?: string; error?: string }

async function send(scan: QueuedScan, usesCapturedTime: boolean): Promise<ClockResult> {
  const { data, error } = await supabase.rpc("clock_in", {
    p_code: scan.code, p_kind: scan.kind, p_device: scan.device, p_label: deviceLabel(), p_captured_at: usesCapturedTime ? scan.capturedAt : null,
  });
  if (error) throw error;
  return data as ClockResult;
}

/** True when a call failed because there was no connection, rather than because the database said no. */
const isOffline = (e: unknown) => !navigator.onLine || (e instanceof TypeError) || /fetch|network/i.test(String((e as { message?: string })?.message ?? ""));

export interface ClockOutcome extends ClockResult { queued?: boolean }

/**
 * Clock in or out with a code. With no signal the scan is kept on the phone with the time it was made and
 * sent when the phone is back online; the database then checks the code against that time.
 */
export async function clockIn(rawCode: string, kind: "in" | "out" | null): Promise<ClockOutcome> {
  const code = cleanCode(rawCode);
  if (code.length !== 6) return { ok: false, error: "The code is six digits." };
  const scan: QueuedScan = { code, kind, capturedAt: new Date().toISOString(), device: deviceId() };
  try {
    return await send(scan, false);
  } catch (e) {
    if (!isOffline(e)) throw e;
    writeQueue(enqueue(readQueue(), scan, Date.now()));
    return { ok: true, queued: true, kind: kind ?? undefined };
  }
}

/** Send any scans kept while offline. Returns how many were sent and how many the database refused. */
export async function flushQueue(): Promise<{ sent: number; refused: number; left: number }> {
  let queue = readQueue();
  let sent = 0, refused = 0;
  for (const scan of [...queue]) {
    try {
      const r = await send(scan, true);
      if (r.ok) sent++; else refused++;
    } catch (e) {
      if (isOffline(e)) break; // still no signal; keep the rest
      refused++; // the database said no for a reason that will not change
    }
    queue = queue.filter((q) => q !== scan && !(q.capturedAt === scan.capturedAt && q.code === scan.code));
    writeQueue(queue);
  }
  return { sent, refused, left: readQueue().length };
}

// ─── Records ─────────────────────────────────────────────────────────────────

export interface MyEntry { id: string; day: string; kind: "in" | "out"; capturedAt: string; flags: string[]; source: "code" | "marked" }

export async function listMyEntries(days = 14): Promise<MyEntry[]> {
  const { data, error } = await supabase.rpc("my_clockin_events", { p_days: days });
  if (error) throw error;
  return ((data ?? []) as { id: string; day: string; kind: "in" | "out"; captured_at: string; flags: string[]; source: "code" | "marked" }[])
    .map((r) => ({ id: r.id, day: r.day, kind: r.kind, capturedAt: r.captured_at, flags: r.flags ?? [], source: r.source }));
}

export type RosterStatus = "present" | "late" | "absent";

export interface RosterRow { day: string; profileId: string; name: string; firstIn: string | null; lastOut: string | null; flags: string[]; events: number; status: RosterStatus; marked: boolean }

export async function getRoster(from: string, to: string): Promise<RosterRow[]> {
  const { data, error } = await supabase.rpc("clockin_roster", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as { day: string; profile_id: string; full_name: string; first_in: string | null; last_out: string | null; flags: string[]; events: number; status: RosterStatus; marked: boolean }[])
    .map((r) => ({ day: r.day, profileId: r.profile_id, name: r.full_name, firstIn: r.first_in, lastOut: r.last_out, flags: r.flags ?? [], events: r.events, status: r.status, marked: r.marked }));
}

export async function markStaff(profileId: string, day: string, kind: "in" | "out", time: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("mark_staff_clock", { p_profile: profileId, p_day: day, p_kind: kind, p_time: time, p_note: note || null });
  if (error) throw error;
}

export async function removeMarked(id: string): Promise<void> {
  const { error } = await supabase.rpc("remove_marked_clock", { p_id: id });
  if (error) throw error;
}

// ─── Phones and the people who take attendance ───────────────────────────────

export interface Phone { id: string; profileId: string; name: string; label: string | null; approved: boolean; firstSeen: string; lastSeen: string }

export async function listPhones(): Promise<Phone[]> {
  const { data, error } = await supabase.rpc("clockin_devices_list");
  if (error) throw error;
  return ((data ?? []) as { id: string; profile_id: string; full_name: string; label: string | null; approved: boolean; first_seen: string; last_seen: string }[])
    .map((r) => ({ id: r.id, profileId: r.profile_id, name: r.full_name, label: r.label, approved: r.approved, firstSeen: r.first_seen, lastSeen: r.last_seen }));
}

export async function setPhoneApproved(id: string, approved: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_clockin_device_approved", { p_id: id, p_approved: approved });
  if (error) throw error;
}

export async function removePhone(id: string): Promise<void> {
  const { error } = await supabase.from("clockin_devices").delete().eq("id", id);
  if (error) throw error;
}

export interface Taker { id: string; profileId: string; name: string; fromDate: string | null; untilDate: string | null; active: boolean }

export async function listTakers(): Promise<Taker[]> {
  const { data, error } = await supabase.rpc("list_clockin_takers");
  if (error) throw error;
  return ((data ?? []) as { id: string; profile_id: string; full_name: string; from_date: string | null; until_date: string | null; active: boolean }[])
    .map((r) => ({ id: r.id, profileId: r.profile_id, name: r.full_name, fromDate: r.from_date, untilDate: r.until_date, active: r.active }));
}

export async function saveTaker(profileId: string, from: string, until: string): Promise<void> {
  const { error } = await supabase.rpc("save_clockin_taker", { p_profile: profileId, p_from: from || null, p_until: until || null });
  if (error) throw error;
}

export async function removeTaker(id: string): Promise<void> {
  const { error } = await supabase.rpc("remove_clockin_taker", { p_id: id });
  if (error) throw error;
}

export interface StaffPerson { id: string; name: string }

/** The staff a person may mark or choose to take attendance. */
export async function listClockStaff(): Promise<StaffPerson[]> {
  const { data, error } = await supabase.rpc("clockin_staff");
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string }[]).map((r) => ({ id: r.id, name: r.full_name }));
}

export interface DayEntry { id: string; kind: "in" | "out"; capturedAt: string; source: "code" | "marked"; flags: string[]; note: string | null; markedBy: string | null }

/** One person's entries for one day. */
export async function listDayEntries(profileId: string, day: string): Promise<DayEntry[]> {
  const { data, error } = await supabase.rpc("clockin_day_entries", { p_profile: profileId, p_day: day });
  if (error) throw error;
  return ((data ?? []) as { id: string; kind: "in" | "out"; captured_at: string; source: "code" | "marked"; flags: string[]; note: string | null; marked_by_name: string | null }[])
    .map((r) => ({ id: r.id, kind: r.kind, capturedAt: r.captured_at, source: r.source, flags: r.flags ?? [], note: r.note, markedBy: r.marked_by_name }));
}
