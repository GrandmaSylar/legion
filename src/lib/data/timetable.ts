// Data layer for the Basic Timetable (public.timetable_slots).
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export const WEEKDAYS: { day: number; name: string; short: string }[] = [
  { day: 1, name: "Monday", short: "Mon" },
  { day: 2, name: "Tuesday", short: "Tue" },
  { day: 3, name: "Wednesday", short: "Wed" },
  { day: 4, name: "Thursday", short: "Thu" },
  { day: 5, name: "Friday", short: "Fri" },
];

export interface TimetableSlot {
  id: string;
  classId: string;
  className: string;
  classSubjectId: string | null;
  subjectName: string | null;
  teacherName: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  label: string | null;
  /** A lesson (with or without a subject yet) or a break. */
  kind: "lesson" | "break";
}

function trimTime(t: string): string {
  return t.slice(0, 5);
}

type JoinedSlotRow = {
  id: string;
  class_id: string;
  class_subject_id: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  label: string | null;
  kind: string;
  classes?:
    | { section: string; levels?: { name: string } | { name: string }[] | null }
    | { section: string; levels?: { name: string } | { name: string }[] | null }[]
    | null;
  class_subjects?:
    | {
        subjects?: { name: string } | { name: string }[] | null;
        staff?: { full_name: string } | { full_name: string }[] | null;
      }
    | {
        subjects?: { name: string } | { name: string }[] | null;
        staff?: { full_name: string } | { full_name: string }[] | null;
      }[]
    | null;
};

function mapSlot(r: JoinedSlotRow): TimetableSlot {
  const cls = Array.isArray(r.classes) ? r.classes[0] : r.classes;
  const lvl = cls
    ? Array.isArray(cls.levels)
      ? cls.levels[0]
      : cls.levels
    : null;
  const cs = Array.isArray(r.class_subjects)
    ? r.class_subjects[0]
    : r.class_subjects;
  const subj = cs
    ? Array.isArray(cs.subjects)
      ? cs.subjects[0]
      : cs.subjects
    : null;
  const teacher = cs
    ? Array.isArray(cs.staff)
      ? cs.staff[0]
      : cs.staff
    : null;

  return {
    id: r.id,
    classId: r.class_id,
    className: cls ? [lvl?.name, cls.section].filter(Boolean).join(" ") : "",
    classSubjectId: r.class_subject_id,
    subjectName: subj?.name ?? null,
    teacherName: teacher?.full_name ?? null,
    dayOfWeek: r.day_of_week,
    startTime: trimTime(r.start_time),
    endTime: trimTime(r.end_time),
    label: r.label,
    kind: r.kind === "break" ? "break" : "lesson",
  };
}

export async function listClassTimetable(
  classId: string,
): Promise<TimetableSlot[]> {
  if (!classId) return [];
  const rows = check(
    await supabase
      .from("timetable_slots")
      .select(
        "id, class_id, class_subject_id, day_of_week, start_time, end_time, label, kind, classes(section, levels(name)), class_subjects(subjects(name), staff(full_name))",
      )
      .eq("class_id", classId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true }),
  );
  return (rows as JoinedSlotRow[]).map(mapSlot);
}

export async function listTodayTimetable(
  academicYearId: string,
  dayOfWeek: number,
): Promise<TimetableSlot[]> {
  if (!academicYearId || dayOfWeek < 1 || dayOfWeek > 5) return [];
  const rows = check(
    await supabase
      .from("timetable_slots")
      .select(
        "id, class_id, class_subject_id, day_of_week, start_time, end_time, label, kind, classes!inner(academic_year_id, section, levels(name)), class_subjects(subjects(name), staff(full_name))",
      )
      .eq("classes.academic_year_id", academicYearId)
      .eq("day_of_week", dayOfWeek)
      .order("start_time", { ascending: true }),
  );
  return (rows as JoinedSlotRow[]).map(mapSlot);
}

export async function saveTimetableSlot(input: {
  classId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classSubjectId: string | null;
  label: string;
}): Promise<void> {
  check(
    await supabase.from("timetable_slots").upsert(
      {
        class_id: input.classId,
        day_of_week: input.dayOfWeek,
        start_time: input.startTime,
        end_time: input.endTime,
        class_subject_id: input.classSubjectId || null,
        label: input.label.trim() || null,
        kind: input.classSubjectId ? "lesson" : "break",
      },
      { onConflict: "class_id,day_of_week,start_time" },
    ),
  );
}

export async function deleteTimetableSlot(id: string): Promise<void> {
  check(await supabase.from("timetable_slots").delete().eq("id", id));
}

/** Put a subject into a lesson slot (or take it out, leaving the lesson empty). */
export async function assignSlotSubject(id: string, classSubjectId: string | null): Promise<void> {
  check(await supabase.from("timetable_slots").update({ class_subject_id: classSubjectId, kind: "lesson" }).eq("id", id));
}
