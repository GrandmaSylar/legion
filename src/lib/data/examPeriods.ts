// Data layer for exam periods. The database enforces the window for entering marks and who may set
// periods up; these calls read and write the periods, and the screens only decide what to show.
import { supabase } from "../supabase";

export type ExamKind = "mock" | "mid_term" | "term_exam" | "other";

export const EXAM_KIND_LABELS: Record<ExamKind, string> = {
  mock: "Mock exam", mid_term: "Mid-term", term_exam: "Term exam", other: "Other",
};

export interface ExamPeriod {
  id: string;
  termId: string;
  name: string;
  kind: ExamKind;
  startsOn: string;
  endsOn: string;
  allClasses: boolean;
  classIds: string[];
  restrictEntry: boolean;
  entryOpensOn: string | null;
  entryClosesOn: string | null;
  showOnCalendar: boolean;
}

interface Row {
  id: string; term_id: string; name: string; kind: string; starts_on: string; ends_on: string; all_classes: boolean;
  restrict_entry: boolean; entry_opens_on: string | null; entry_closes_on: string | null; show_on_calendar: boolean;
}

const COLUMNS = "id, term_id, name, kind, starts_on, ends_on, all_classes, restrict_entry, entry_opens_on, entry_closes_on, show_on_calendar";

export async function listExamPeriods(): Promise<ExamPeriod[]> {
  const [p, c] = await Promise.all([
    supabase.from("exam_periods").select(COLUMNS).order("starts_on", { ascending: false }),
    supabase.from("exam_period_classes").select("exam_period_id, class_id"),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  const byPeriod = new Map<string, string[]>();
  for (const r of c.data ?? []) byPeriod.set(r.exam_period_id, [...(byPeriod.get(r.exam_period_id) ?? []), r.class_id]);
  return ((p.data ?? []) as Row[]).map((r) => ({
    id: r.id, termId: r.term_id, name: r.name, kind: r.kind as ExamKind, startsOn: r.starts_on, endsOn: r.ends_on,
    allClasses: r.all_classes, classIds: byPeriod.get(r.id) ?? [], restrictEntry: r.restrict_entry,
    entryOpensOn: r.entry_opens_on, entryClosesOn: r.entry_closes_on, showOnCalendar: r.show_on_calendar,
  }));
}

export interface ExamPeriodInput {
  termId: string;
  name: string;
  kind: ExamKind;
  startsOn: string;
  endsOn: string;
  allClasses: boolean;
  classIds: string[];
  restrictEntry: boolean;
  entryOpensOn: string;
  entryClosesOn: string;
  showOnCalendar: boolean;
}

function toRow(i: ExamPeriodInput) {
  return {
    term_id: i.termId, name: i.name.trim(), kind: i.kind, starts_on: i.startsOn, ends_on: i.endsOn, all_classes: i.allClasses,
    restrict_entry: i.restrictEntry, entry_opens_on: i.restrictEntry ? i.entryOpensOn : null,
    entry_closes_on: i.restrictEntry ? i.entryClosesOn : null, show_on_calendar: i.showOnCalendar,
  };
}

async function saveClasses(periodId: string, i: ExamPeriodInput): Promise<void> {
  const del = await supabase.from("exam_period_classes").delete().eq("exam_period_id", periodId);
  if (del.error) throw del.error;
  if (i.allClasses || i.classIds.length === 0) return;
  const ins = await supabase.from("exam_period_classes").insert(i.classIds.map((class_id) => ({ exam_period_id: periodId, class_id })));
  if (ins.error) throw ins.error;
}

export async function createExamPeriod(i: ExamPeriodInput): Promise<void> {
  const { data, error } = await supabase.from("exam_periods").insert(toRow(i)).select("id").single();
  if (error) throw error;
  await saveClasses(data.id, i);
}

export async function updateExamPeriod(id: string, i: ExamPeriodInput): Promise<void> {
  const { error } = await supabase.from("exam_periods").update(toRow(i)).eq("id", id);
  if (error) throw error;
  await saveClasses(id, i);
}

export async function deleteExamPeriod(id: string): Promise<void> {
  const { error } = await supabase.from("exam_periods").delete().eq("id", id);
  if (error) throw error;
}

// ─── Window status, for showing and for the presets ──────────────────────────

export type WindowState = "none" | "upcoming" | "open" | "closed";

/** Where "today" falls against a period's window for entering marks. The database makes the real decision. */
export function windowState(p: Pick<ExamPeriod, "restrictEntry" | "entryOpensOn" | "entryClosesOn">, today: string): WindowState {
  if (!p.restrictEntry || !p.entryOpensOn || !p.entryClosesOn) return "none";
  if (today < p.entryOpensOn) return "upcoming";
  if (today > p.entryClosesOn) return "closed";
  return "open";
}

/** Sensible starting choices for each kind of period. They only fill in the form; every value can be changed. */
export function presetFor(kind: ExamKind, startsOn: string, endsOn: string, addDays: (d: string, n: number) => string) {
  switch (kind) {
    case "mock":
      return { name: "Mock exam", restrictEntry: true, entryOpensOn: startsOn, entryClosesOn: addDays(endsOn, 3), showOnCalendar: true };
    case "mid_term":
      return { name: "Mid-term tests", restrictEntry: false, entryOpensOn: startsOn, entryClosesOn: addDays(endsOn, 3), showOnCalendar: true };
    case "term_exam":
      return { name: "End of term exams", restrictEntry: true, entryOpensOn: startsOn, entryClosesOn: addDays(endsOn, 7), showOnCalendar: true };
    default:
      return { name: "", restrictEntry: false, entryOpensOn: startsOn, entryClosesOn: addDays(endsOn, 3), showOnCalendar: true };
  }
}
