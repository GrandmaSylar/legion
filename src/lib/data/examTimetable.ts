// The exam timetable. The database decides who sees which papers and refuses a paper that clashes or falls outside
// the exam period; these calls ask.
import { supabase } from "../supabase";

export interface TimetablePeriod { periodId: string; name: string; kind: string; startsOn: string; endsOn: string; useTimetable: boolean; published: boolean; papers: number }

/** The exam periods whose timetable the signed-in person may see. */
export async function listTimetablePeriods(): Promise<TimetablePeriod[]> {
  const { data, error } = await supabase.rpc("exam_timetable_periods");
  if (error) throw error;
  return ((data ?? []) as { period_id: string; name: string; kind: string; starts_on: string; ends_on: string; use_timetable: boolean; published: boolean; papers: number }[])
    .map((r) => ({ periodId: r.period_id, name: r.name, kind: r.kind, startsOn: r.starts_on, endsOn: r.ends_on, useTimetable: r.use_timetable, published: r.published, papers: Number(r.papers) }));
}

export interface Paper {
  id: string; classId: string; classLabel: string; subjectId: string; subjectName: string; examDate: string; startsAt: string; endsAt: string;
  room: string | null; notes: string | null; invigilatorIds: string[] | null; invigilatorNames: string | null;
}

export async function getTimetable(periodId: string): Promise<Paper[]> {
  const { data, error } = await supabase.rpc("exam_timetable", { p_period: periodId });
  if (error) throw error;
  return ((data ?? []) as { paper_id: string; class_id: string; class_label: string; subject_id: string; subject_name: string; exam_date: string; starts_at: string; ends_at: string;
    room: string | null; notes: string | null; invigilator_ids: string[] | null; invigilator_names: string | null }[])
    .map((r) => ({ id: r.paper_id, classId: r.class_id, classLabel: r.class_label, subjectId: r.subject_id, subjectName: r.subject_name, examDate: r.exam_date, startsAt: r.starts_at, endsAt: r.ends_at,
      room: r.room, notes: r.notes, invigilatorIds: r.invigilator_ids, invigilatorNames: r.invigilator_names }));
}

export interface PaperInput { id?: string; periodId: string; classId: string; subjectId: string; examDate: string; startsAt: string; endsAt: string; room: string; notes: string }

export async function savePaper(i: PaperInput): Promise<string> {
  const { data, error } = await supabase.rpc("save_exam_paper", {
    p_id: i.id ?? null, p_period: i.periodId, p_class: i.classId, p_subject: i.subjectId, p_date: i.examDate, p_start: i.startsAt, p_end: i.endsAt, p_room: i.room || null, p_notes: i.notes || null,
  });
  if (error) throw error;
  return data as string;
}

export async function deletePaper(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_exam_paper", { p_id: id });
  if (error) throw error;
}

export async function assignInvigilators(paperId: string, people: string[]): Promise<void> {
  const { error } = await supabase.rpc("assign_invigilators", { p_paper: paperId, p_people: people });
  if (error) throw error;
}

export async function setTimetablePublished(periodId: string, published: boolean): Promise<number> {
  const { data, error } = await supabase.rpc("set_exam_timetable_published", { p_period: periodId, p_published: published });
  if (error) throw error;
  return Number(data ?? 0);
}

/** What an exam period counts for in each scheme: the parts tied to its kind of exam. */
export async function getPeriodWeights(periodId: string): Promise<{ scheme: string; part: string; weight: number }[]> {
  const { data, error } = await supabase.rpc("exam_period_weights", { p_period: periodId });
  if (error) throw error;
  return ((data ?? []) as { scheme_name: string; part_name: string; weight: string }[]).map((r) => ({ scheme: r.scheme_name, part: r.part_name, weight: Number(r.weight) }));
}

/** The subjects a class takes, for choosing a paper. */
export async function listClassSubjects(classId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("class_subjects").select("subject_id, subjects(name)").eq("class_id", classId);
  if (error) throw error;
  type Row = { subject_id: string; subjects: { name: string } | { name: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.subject_id, name: (Array.isArray(r.subjects) ? r.subjects[0] : r.subjects)?.name ?? "" })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function setPartExamKind(partId: string, kind: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_part_exam_kind", { p_part: partId, p_kind: kind });
  if (error) throw error;
}
