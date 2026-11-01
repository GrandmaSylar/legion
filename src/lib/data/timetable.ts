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
        "id, class_id, class_subject_id, day_of_week, start_time, end_time, label, classes(section, levels(name)), class_subjects(subjects(name), staff(full_name))",
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
        "id, class_id, class_subject_id, day_of_week, start_time, end_time, label, classes!inner(academic_year_id, section, levels(name)), class_subjects(subjects(name), staff(full_name))",
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
      },
      { onConflict: "class_id,day_of_week,start_time" },
    ),
  );
}

export async function deleteTimetableSlot(id: string): Promise<void> {
  check(await supabase.from("timetable_slots").delete().eq("id", id));
}

/**
 * Generates a standard Monday–Friday timetable rotating through the class's
 * assigned subjects plus morning break and lunch break.
 */
export async function generateDefaultClassTimetable(
  classId: string,
): Promise<void> {
  const csRows = check(
    await supabase
      .from("class_subjects")
      .select("id, subjects(name)")
      .eq("class_id", classId),
  );

  const subjectIds = csRows.map((r) => r.id);

  const slotsToUpsert: {
    class_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    class_subject_id: string | null;
    label: string | null;
  }[] = [];

  const teachingBlocks = [
    { start: "08:30", end: "09:30" },
    { start: "09:30", end: "10:30" },
    { start: "11:00", end: "12:00" },
    { start: "12:00", end: "13:00" },
    { start: "14:00", end: "15:00" },
  ];

  let cursor = 0;
  for (let day = 1; day <= 5; day++) {
    slotsToUpsert.push({
      class_id: classId,
      day_of_week: day,
      start_time: "10:30",
      end_time: "11:00",
      class_subject_id: null,
      label: "Snack Break",
    });
    slotsToUpsert.push({
      class_id: classId,
      day_of_week: day,
      start_time: "13:00",
      end_time: "14:00",
      class_subject_id: null,
      label: "Lunch Break",
    });

    if (subjectIds.length > 0) {
      for (const block of teachingBlocks) {
        const csId = subjectIds[cursor % subjectIds.length];
        cursor += 1;
        slotsToUpsert.push({
          class_id: classId,
          day_of_week: day,
          start_time: block.start,
          end_time: block.end,
          class_subject_id: csId,
          label: null,
        });
      }
    }
  }

  check(
    await supabase
      .from("timetable_slots")
      .upsert(slotsToUpsert, { onConflict: "class_id,day_of_week,start_time" }),
  );
}
