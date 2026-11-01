// Data layer for daily student attendance.
// RLS scopes reads to classes/students the caller may view (can_view_enrollment)
// and writes to classes the caller teaches or administers (can_teach_enrollment).
// Offline drafts are persisted in user-scoped localStorage so a teacher on a
// patchy connection never loses a register.
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export const ATTENDANCE_STATUSES: {
  value: AttendanceStatus;
  label: string;
  short: string;
}[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "late", label: "Late", short: "L" },
  { value: "excused", label: "Excused", short: "E" },
  { value: "absent", label: "Absent", short: "A" },
];

export interface AttendanceRosterItem {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  fullName: string;
  photoPath: string | null;
  status: AttendanceStatus | null;
  note: string;
  attendanceId: string | null;
  updatedAt: string | null;
}

export interface ClassDaySummary {
  date: string;
  total: number;
  marked: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
}

export interface StudentAttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  total: number;
  recent: {
    id: string;
    date: string;
    status: AttendanceStatus;
    note: string | null;
    className: string;
  }[];
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDateIso(dateIso: string, deltaDays: number): string {
  const d = new Date(dateIso + "T12:00:00");
  d.setDate(d.getDate() + deltaDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Returns the set of class IDs that the signed-in staff member teaches in the
 * given academic year (either as class teacher or subject teacher).
 */
export async function getMyTeachableClassIds(
  userId: string,
  academicYearId: string,
): Promise<Set<string>> {
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id")
    .eq("profile_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!staffRow?.id) return new Set();
  const staffId = staffRow.id;

  const [{ data: directClasses }, { data: subjectClasses }] = await Promise.all([
    supabase
      .from("classes")
      .select("id")
      .eq("academic_year_id", academicYearId)
      .eq("class_teacher_id", staffId),
    supabase
      .from("class_subjects")
      .select("class_id, classes!inner(academic_year_id)")
      .eq("teacher_id", staffId)
      .eq("classes.academic_year_id", academicYearId),
  ]);

  const ids = new Set<string>();
  for (const c of directClasses ?? []) ids.add(c.id);
  for (const cs of subjectClasses ?? []) ids.add(cs.class_id);
  return ids;
}

/**
 * Loads the active pupil roster for a class along with their attendance marks
 * for the specified date.
 */
export async function getClassRosterForDate(
  classId: string,
  date: string,
): Promise<AttendanceRosterItem[]> {
  const enrollments = check(
    await supabase
      .from("enrollments")
      .select(
        "id, student_id, students!inner(id, admission_no, first_name, middle_name, last_name, photo_url, status, deleted_at)",
      )
      .eq("class_id", classId)
      .eq("status", "enrolled")
      .eq("students.status", "active")
      .is("students.deleted_at", null),
  );

  if (enrollments.length === 0) return [];

  const enrollmentIds = enrollments.map((e) => e.id);
  const marks = check(
    await supabase
      .from("attendance")
      .select("id, enrollment_id, status, note, updated_at")
      .eq("date", date)
      .in("enrollment_id", enrollmentIds),
  );

  const markByEnrollment = new Map(marks.map((m) => [m.enrollment_id, m]));

  type StudentJoined = {
    id: string;
    admission_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    photo_url: string | null;
  };

  return enrollments
    .map((e) => {
      const s = (Array.isArray(e.students) ? e.students[0] : e.students) as StudentJoined;
      const mark = markByEnrollment.get(e.id);
      const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
      return {
        enrollmentId: e.id,
        studentId: s.id,
        admissionNo: s.admission_no,
        fullName,
        lastName: s.last_name,
        firstName: s.first_name,
        photoPath: s.photo_url,
        status: (mark?.status as AttendanceStatus | undefined) ?? null,
        note: mark?.note ?? "",
        attendanceId: mark?.id ?? null,
        updatedAt: mark?.updated_at ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.admissionNo.localeCompare(b.admissionNo),
    )
    .map(({ lastName: _l, firstName: _f, ...item }) => item);
}

/**
 * Batch saves the attendance register for a class on a given date.
 * Rows with a status are upserted; rows cleared to null are removed.
 */
export async function saveClassAttendance(
  date: string,
  entries: { enrollmentId: string; status: AttendanceStatus | null; note: string }[],
): Promise<void> {
  const toUpsert = entries
    .filter((e): e is { enrollmentId: string; status: AttendanceStatus; note: string } => e.status !== null)
    .map((e) => ({
      enrollment_id: e.enrollmentId,
      date,
      status: e.status,
      note: e.note.trim() || null,
    }));

  const toClear = entries.filter((e) => e.status === null).map((e) => e.enrollmentId);

  if (toUpsert.length > 0) {
    check(
      await supabase
        .from("attendance")
        .upsert(toUpsert, { onConflict: "enrollment_id,date" }),
    );
  }

  if (toClear.length > 0) {
    check(
      await supabase
        .from("attendance")
        .delete()
        .eq("date", date)
        .in("enrollment_id", toClear),
    );
  }
}

/**
 * Loads recent daily attendance summaries for a class (up to `limitDays` most
 * recent dates on which attendance was recorded).
 */
export async function getRecentClassAttendance(
  classId: string,
  limitDays = 10,
): Promise<ClassDaySummary[]> {
  const enrollments = check(
    await supabase
      .from("enrollments")
      .select("id, students!inner(status, deleted_at)")
      .eq("class_id", classId)
      .eq("status", "enrolled")
      .eq("students.status", "active")
      .is("students.deleted_at", null),
  );

  const total = enrollments.length;
  if (total === 0) return [];

  const enrollmentIds = enrollments.map((e) => e.id);
  const rows = check(
    await supabase
      .from("attendance")
      .select("date, status")
      .in("enrollment_id", enrollmentIds)
      .order("date", { ascending: false })
      .limit(total * limitDays),
  );

  const byDate = new Map<string, ClassDaySummary>();
  for (const r of rows) {
    let day = byDate.get(r.date);
    if (!day) {
      if (byDate.size >= limitDays) continue;
      day = { date: r.date, total, marked: 0, present: 0, late: 0, excused: 0, absent: 0 };
      byDate.set(r.date, day);
    }
    day.marked += 1;
    const st = r.status as AttendanceStatus;
    if (st === "present") day.present += 1;
    else if (st === "late") day.late += 1;
    else if (st === "excused") day.excused += 1;
    else if (st === "absent") day.absent += 1;
  }

  return Array.from(byDate.values()).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Attendance summary and recent log for a single student (shown on StudentDetail).
 */
export async function getStudentAttendance(studentId: string): Promise<StudentAttendanceSummary> {
  const rows = check(
    await supabase
      .from("attendance")
      .select(
        "id, date, status, note, enrollments!inner(student_id, classes(section, levels(name)))",
      )
      .eq("enrollments.student_id", studentId)
      .order("date", { ascending: false })
      .limit(200),
  );

  let present = 0;
  let late = 0;
  let excused = 0;
  let absent = 0;

  const recent = rows.slice(0, 10).map((r) => {
    const enrol = Array.isArray(r.enrollments) ? r.enrollments[0] : r.enrollments;
    const cls = enrol ? (Array.isArray(enrol.classes) ? enrol.classes[0] : enrol.classes) : null;
    const lvl = cls ? (Array.isArray(cls.levels) ? cls.levels[0] : cls.levels) : null;
    const className = [lvl?.name, cls?.section].filter(Boolean).join(" ");
    return {
      id: r.id,
      date: r.date,
      status: r.status as AttendanceStatus,
      note: r.note,
      className,
    };
  });

  for (const r of rows) {
    const st = r.status as AttendanceStatus;
    if (st === "present") present += 1;
    else if (st === "late") late += 1;
    else if (st === "excused") excused += 1;
    else if (st === "absent") absent += 1;
  }

  return {
    present,
    late,
    excused,
    absent,
    total: rows.length,
    recent,
  };
}

// ─── Offline Draft Storage ───────────────────────────────────────────────────

export type DraftMap = Record<string, { status: AttendanceStatus | null; note: string }>;

function draftKey(userId: string | null, classId: string, date: string): string {
  return `sms.attendance.draft.${userId ?? "guest"}.${classId}.${date}`;
}

export function loadAttendanceDraft(
  userId: string | null,
  classId: string,
  date: string,
): DraftMap | null {
  if (!classId || !date) return null;
  try {
    const raw = localStorage.getItem(draftKey(userId, classId, date));
    if (!raw) return null;
    return JSON.parse(raw) as DraftMap;
  } catch {
    return null;
  }
}

export function saveAttendanceDraft(
  userId: string | null,
  classId: string,
  date: string,
  draft: DraftMap,
): void {
  if (!classId || !date) return;
  try {
    if (Object.keys(draft).length === 0) {
      localStorage.removeItem(draftKey(userId, classId, date));
    } else {
      localStorage.setItem(draftKey(userId, classId, date), JSON.stringify(draft));
    }
  } catch {
    /* ignore storage quota errors */
  }
}

export function clearAttendanceDraft(
  userId: string | null,
  classId: string,
  date: string,
): void {
  if (!classId || !date) return;
  try {
    localStorage.removeItem(draftKey(userId, classId, date));
  } catch {
    /* ignore */
  }
}
