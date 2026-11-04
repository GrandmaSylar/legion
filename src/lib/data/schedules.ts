// The school day: bell schedules (a named list of periods and breaks with real times), which schedule each
// weekday uses, and laying a class's timetable out from them. The database checks the rules and decides
// who may do what; these calls read and ask.
import { supabase } from "../supabase";
import type { DayPeriod, PeriodKind } from "../bell";

export interface BellSchedule {
  id: string;
  name: string;
  periods: DayPeriod[];
}

interface PeriodRow { schedule_id: string; position: number; label: string; kind: string; starts_at: string; ends_at: string }

export async function listBellSchedules(): Promise<BellSchedule[]> {
  const [s, p] = await Promise.all([
    supabase.from("bell_schedules").select("id, name").order("name"),
    supabase.from("bell_periods").select("schedule_id, position, label, kind, starts_at, ends_at").order("position"),
  ]);
  if (s.error) throw s.error;
  if (p.error) throw p.error;
  const by = new Map<string, DayPeriod[]>();
  for (const r of (p.data ?? []) as PeriodRow[]) {
    by.set(r.schedule_id, [...(by.get(r.schedule_id) ?? []), { label: r.label, kind: r.kind as PeriodKind, start: r.starts_at.slice(0, 5), end: r.ends_at.slice(0, 5) }]);
  }
  return (s.data ?? []).map((r) => ({ id: r.id, name: r.name, periods: by.get(r.id) ?? [] }));
}

export async function saveBellSchedule(input: { id?: string; name: string; periods: DayPeriod[] }): Promise<string> {
  const { data, error } = await supabase.rpc("save_bell_schedule", {
    p_id: input.id ?? null, p_name: input.name, p_periods: input.periods.map((p) => ({ label: p.label.trim(), kind: p.kind, start: p.start, end: p.end })),
  });
  if (error) throw error;
  return data as string;
}

export async function deleteBellSchedule(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_bell_schedule", { p_id: id });
  if (error) throw error;
}

export interface BellAssignment { levelId: string | null; day: number; scheduleId: string }

export async function listBellAssignments(): Promise<BellAssignment[]> {
  const { data, error } = await supabase.from("bell_assignments").select("level_id, day_of_week, schedule_id");
  if (error) throw error;
  return (data ?? []).map((r) => ({ levelId: r.level_id, day: r.day_of_week, scheduleId: r.schedule_id }));
}

/** Choose the schedule a weekday uses for the whole school (no level) or one level. No schedule removes the choice. */
export async function setBellAssignment(levelId: string | null, day: number, scheduleId: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_bell_assignment", { p_level: levelId, p_day: day, p_schedule: scheduleId });
  if (error) throw error;
}

export interface ApplyResult { created: number; removed: number; offSchedule: number; classes?: number }

export async function applyBellSchedule(classId: string): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc("apply_bell_schedule", { p_class: classId });
  if (error) throw error;
  return data as ApplyResult;
}

export async function applyBellScheduleToAll(): Promise<ApplyResult> {
  const { data, error } = await supabase.rpc("apply_bell_schedule_to_all");
  if (error) throw error;
  return data as ApplyResult;
}

/** Give a class's empty lessons their subjects, in turn. Returns how many were filled. */
export async function fillClassSubjects(classId: string): Promise<number> {
  const { data, error } = await supabase.rpc("fill_class_subjects", { p_class: classId });
  if (error) throw error;
  return Number(data ?? 0);
}
