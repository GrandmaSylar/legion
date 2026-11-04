// Syllabus and lesson plans. The database decides who sees what, enforces the plan period and the status
// flow (draft, submitted, approved or sent back), and notifies; these calls read and ask.
import { supabase } from "../supabase";

export type PlanStatus = "draft" | "submitted" | "approved" | "changes_requested";

export const STATUS_LABELS: Record<PlanStatus, string> = {
  draft: "Draft", submitted: "Submitted", approved: "Approved", changes_requested: "Sent back",
};

// ─── The rules and the current periods ───────────────────────────────────────

export interface PlanPeriod { start: string; end: string; dueOn: string }

export interface PlanSchedule {
  periodWeeks: number;
  dueWeekday: number;
  requireReview: boolean;
  current: PlanPeriod;
  next: PlanPeriod;
}

export async function getPlanSchedule(): Promise<PlanSchedule> {
  const { data, error } = await supabase.rpc("lesson_plan_schedule");
  if (error) throw error;
  return data as PlanSchedule;
}

export async function savePlanSettings(periodWeeks: number, dueWeekday: number, requireReview: boolean): Promise<void> {
  const { error } = await supabase.rpc("save_lesson_plan_settings", { p_period_weeks: periodWeeks, p_due_weekday: dueWeekday, p_require_review: requireReview });
  if (error) throw error;
}

// ─── The syllabus ────────────────────────────────────────────────────────────

export interface Topic {
  id: string;
  subjectId: string;
  levelId: string;
  termNo: number | null;
  weekNo: number | null;
  position: number;
  title: string;
  objectives: string | null;
}

interface TopicRow { id: string; subject_id: string; level_id: string; term_no: number | null; week_no: number | null; position: number; title: string; objectives: string | null }

export async function listTopics(): Promise<Topic[]> {
  const { data, error } = await supabase.from("syllabus_topics").select("id, subject_id, level_id, term_no, week_no, position, title, objectives").order("position").limit(5000);
  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map((r) => ({
    id: r.id, subjectId: r.subject_id, levelId: r.level_id, termNo: r.term_no, weekNo: r.week_no, position: r.position, title: r.title, objectives: r.objectives,
  }));
}

export interface TopicInput { id?: string; subjectId: string; levelId: string; termNo: string; weekNo: string; title: string; objectives: string; position?: number }

export async function saveTopic(i: TopicInput): Promise<void> {
  const row = {
    subject_id: i.subjectId, level_id: i.levelId, term_no: i.termNo ? Number(i.termNo) : null, week_no: i.weekNo ? Number(i.weekNo) : null,
    title: i.title.trim(), objectives: i.objectives.trim() || null,
  };
  const res = i.id
    ? await supabase.from("syllabus_topics").update(row).eq("id", i.id)
    : await supabase.from("syllabus_topics").insert({ ...row, position: i.position ?? 0 });
  if (res.error) throw res.error;
}

export async function deleteTopic(id: string): Promise<void> {
  const { error } = await supabase.from("syllabus_topics").delete().eq("id", id);
  if (error) throw error;
}

/** Swap the order of two topics. */
export async function swapTopics(a: Topic, b: Topic): Promise<void> {
  const first = await supabase.from("syllabus_topics").update({ position: b.position }).eq("id", a.id);
  if (first.error) throw first.error;
  const second = await supabase.from("syllabus_topics").update({ position: a.position }).eq("id", b.id);
  if (second.error) throw second.error;
}

export interface ImportRow { term?: number | null; week?: number | null; title: string; objectives?: string }

export async function importTopics(subjectId: string, levelId: string, rows: ImportRow[], replace: boolean): Promise<number> {
  const { data, error } = await supabase.rpc("import_syllabus_topics", { p_subject: subjectId, p_level: levelId, p_rows: rows, p_replace: replace });
  if (error) throw error;
  return Number(data ?? 0);
}

// ─── Lesson plans ────────────────────────────────────────────────────────────

export interface LessonPlan {
  id: string;
  classSubjectId: string;
  weekStart: string;
  topicId: string | null;
  topic: string;
  objectives: string | null;
  activities: string | null;
  resources: string | null;
  homework: string | null;
  notes: string | null;
  status: PlanStatus;
  authorId: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
}

interface PlanRow {
  id: string; class_subject_id: string; week_start: string; topic_id: string | null; topic: string; objectives: string | null; activities: string | null;
  resources: string | null; homework: string | null; notes: string | null; status: string; author_id: string | null; submitted_at: string | null;
  reviewed_at: string | null; review_comment: string | null;
}

const toPlan = (r: PlanRow): LessonPlan => ({
  id: r.id, classSubjectId: r.class_subject_id, weekStart: r.week_start, topicId: r.topic_id, topic: r.topic, objectives: r.objectives, activities: r.activities,
  resources: r.resources, homework: r.homework, notes: r.notes, status: r.status as PlanStatus, authorId: r.author_id, submittedAt: r.submitted_at,
  reviewedAt: r.reviewed_at, reviewComment: r.review_comment,
});

/** The plans the signed-in person may see: their own, or everyone's for someone who oversees plans. */
export async function listPlans(): Promise<LessonPlan[]> {
  const { data, error } = await supabase.from("lesson_plans")
    .select("id, class_subject_id, week_start, topic_id, topic, objectives, activities, resources, homework, notes, status, author_id, submitted_at, reviewed_at, review_comment")
    .order("week_start", { ascending: false }).limit(3000);
  if (error) throw error;
  return ((data ?? []) as PlanRow[]).map(toPlan);
}

export interface PlanInput {
  id?: string;
  classSubjectId: string;
  weekStart: string;
  topicId: string;
  topic: string;
  objectives: string;
  activities: string;
  resources: string;
  homework: string;
  notes: string;
}

export async function savePlan(i: PlanInput): Promise<string> {
  const { data, error } = await supabase.rpc("save_lesson_plan", {
    p_id: i.id ?? null, p_class_subject: i.classSubjectId, p_week_start: i.weekStart, p_topic_id: i.topicId || null, p_topic: i.topic,
    p_objectives: i.objectives || null, p_activities: i.activities || null, p_resources: i.resources || null, p_homework: i.homework || null, p_notes: i.notes || null,
  });
  if (error) throw error;
  return data as string;
}

export async function submitPlan(id: string): Promise<void> {
  const { error } = await supabase.rpc("submit_lesson_plan", { p_id: id });
  if (error) throw error;
}

export async function reviewPlan(id: string, decision: "approved" | "changes_requested", comment: string): Promise<void> {
  const { error } = await supabase.rpc("review_lesson_plan", { p_id: id, p_decision: decision, p_comment: comment || null });
  if (error) throw error;
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("lesson_plans").delete().eq("id", id);
  if (error) throw error;
}

export interface TrackerRow { classSubjectId: string; classLabel: string; subjectName: string; teacherName: string; planId: string | null; status: PlanStatus | null; topic: string | null }

export async function getTracker(periodStart: string): Promise<TrackerRow[]> {
  const { data, error } = await supabase.rpc("lesson_plan_tracker", { p_period_start: periodStart });
  if (error) throw error;
  return ((data ?? []) as { class_subject_id: string; class_label: string; subject_name: string; teacher_name: string; plan_id: string | null; status: string | null; topic: string | null }[]).map((r) => ({
    classSubjectId: r.class_subject_id, classLabel: r.class_label, subjectName: r.subject_name, teacherName: r.teacher_name, planId: r.plan_id,
    status: r.status as PlanStatus | null, topic: r.topic,
  }));
}

// ─── What a teacher teaches ──────────────────────────────────────────────────

export interface MyClassSubject { id: string; classLabel: string; subjectId: string; subjectName: string; levelId: string }

/** The class-subjects in the current year that the signed-in teacher teaches (or whose class they lead). */
export async function listMyClassSubjects(profileId: string): Promise<MyClassSubject[]> {
  const me = await supabase.from("staff").select("id").eq("profile_id", profileId).maybeSingle();
  if (me.error) throw me.error;
  if (!me.data) return [];
  const { data, error } = await supabase.from("class_subjects")
    .select("id, teacher_id, subject_id, subjects(name), classes!inner(section, level_id, class_teacher_id, levels(name), academic_years!inner(is_current))")
    .eq("classes.academic_years.is_current", true);
  if (error) throw error;
  type Row = { id: string; teacher_id: string | null; subject_id: string; subjects: { name: string } | { name: string }[] | null;
    classes: { section: string; level_id: string; class_teacher_id: string | null; levels: { name: string } | { name: string }[] | null } | { section: string; level_id: string; class_teacher_id: string | null; levels: { name: string } | { name: string }[] | null }[] };
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  return ((data ?? []) as unknown as Row[])
    .map((r) => ({ r, c: one(r.classes), s: one(r.subjects) }))
    .filter(({ r, c }) => !!c && (r.teacher_id === me.data!.id || c.class_teacher_id === me.data!.id))
    .map(({ r, c, s }) => ({ id: r.id, classLabel: `${one(c!.levels)?.name ?? ""} ${c!.section}`.trim(), subjectId: r.subject_id, subjectName: s?.name ?? "", levelId: c!.level_id }))
    .sort((a, b) => a.classLabel.localeCompare(b.classLabel, undefined, { numeric: true }) || a.subjectName.localeCompare(b.subjectName));
}

// ─── Excel import and the template ───────────────────────────────────────────

export const TEMPLATE_COLUMNS = ["Term (1 to 3, optional)", "Week (optional)", "Topic", "Objectives (optional)"];

/** Read a spreadsheet (Excel or CSV) of topics. The first sheet is used; the header row is found by its names. */
export async function readSyllabusFile(file: File): Promise<{ rows: ImportRow[]; skipped: number }> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: "" }) as unknown[][];
  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const head = grid.findIndex((r) => r.some((c) => /^topic/.test(norm(c))));
  if (head < 0) throw new Error("The file needs a column headed Topic. Use the template.");
  const cols = grid[head].map(norm);
  const at = (re: RegExp) => cols.findIndex((c) => re.test(c));
  const iTerm = at(/^term/), iWeek = at(/^week/), iTopic = at(/^topic/), iObj = at(/^objective/);
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of grid.slice(head + 1)) {
    const title = String(r[iTopic] ?? "").trim();
    if (!title) { if (r.some((c) => String(c).trim())) skipped++; continue; }
    const num = (i: number, lo: number, hi: number) => { const n = Number(String(r[i] ?? "").trim()); return Number.isInteger(n) && n >= lo && n <= hi ? n : null; };
    rows.push({ title: title.slice(0, 160), term: iTerm >= 0 ? num(iTerm, 1, 3) : null, week: iWeek >= 0 ? num(iWeek, 1, 20) : null, objectives: iObj >= 0 ? String(r[iObj] ?? "").trim().slice(0, 1000) : "" });
  }
  return { rows, skipped };
}
