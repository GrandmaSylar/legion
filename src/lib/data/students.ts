// Data layer for students. RLS decides which students each role can see, so a
// teacher's list contains only the pupils they teach.
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export type StudentStatus = "active" | "completed" | "left";
export type Gender = "female" | "male";

export interface StudentRow {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: Gender | null;
  status: StudentStatus;
  /** Class in the current academic year, e.g. "Basic 4 A". */
  className: string | null;
}

export interface StudentFilters {
  search: string;
  classId: string;
  status: StudentStatus | "";
  yearId: string | null;
  page: number;
}

export const PAGE_SIZE = 50;

// PostgREST filter syntax treats these as separators, so drop them from a search.
function cleanSearch(s: string): string {
  return s.replace(/[,()%*\\]/g, " ").trim();
}

function fullName(r: { first_name: string; middle_name: string | null; last_name: string }): string {
  return [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" ");
}

type ClassJoin = { section: string; levels: { name: string } | { name: string }[] | null };

function classLabel(c: ClassJoin | ClassJoin[] | null | undefined): string | null {
  const cls = Array.isArray(c) ? c[0] : c;
  if (!cls) return null;
  const level = Array.isArray(cls.levels) ? cls.levels[0] : cls.levels;
  return `${level?.name ?? ""} ${cls.section}`.trim();
}

export async function listStudents(f: StudentFilters): Promise<{ rows: StudentRow[]; total: number }> {
  // !inner makes the class filter apply to the student, not just the embedded rows.
  const join = f.classId ? "enrollments!inner" : "enrollments";
  let q = supabase
    .from("students")
    .select(
      `id, admission_no, first_name, middle_name, last_name, gender, status,
       ${join}(class_id, academic_year_id, classes(section, levels(name)))`,
      { count: "exact" },
    );
  if (f.status) q = q.eq("status", f.status);
  if (f.classId) q = q.eq("enrollments.class_id", f.classId);
  const term = cleanSearch(f.search);
  if (term) {
    q = q.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,admission_no.ilike.%${term}%`);
  }
  const from = f.page * PAGE_SIZE;
  const res = await q.order("last_name").order("first_name").range(from, from + PAGE_SIZE - 1);
  if (res.error) throw res.error;

  const rows = (res.data ?? []).map((r) => {
    const enrol = (r.enrollments as { academic_year_id: string; classes: ClassJoin | ClassJoin[] | null }[]) ?? [];
    const current = enrol.find((e) => e.academic_year_id === f.yearId) ?? null;
    return {
      id: r.id,
      admissionNo: r.admission_no,
      fullName: fullName(r),
      gender: r.gender as Gender | null,
      status: r.status as StudentStatus,
      className: current ? classLabel(current.classes) : null,
    };
  });
  return { rows, total: res.count ?? rows.length };
}

// ─── Admitting a student ─────────────────────────────────────────────────────

export interface GuardianMatch {
  id: string;
  fullName: string;
  phone: string | null;
  relationship: string | null;
}

export function normalizePhone(p: string): string {
  return p.replace(/[\s\-()]/g, "");
}

/** Siblings share a guardian: find an existing one by phone number. */
export async function findGuardiansByPhone(phone: string): Promise<GuardianMatch[]> {
  const normalized = normalizePhone(phone);
  if (normalized.length < 7) return [];
  const rows = check(
    await supabase
      .from("guardians")
      .select("id, full_name, phone, relationship")
      .eq("phone", normalized)
      .limit(5),
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name, phone: r.phone, relationship: r.relationship }));
}

export interface AdmitInput {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender;
  classId: string;
  medicalNotes: string;
  existingGuardianId: string | null;
  guardianName: string;
  guardianPhone: string;
  guardianRelationship: string;
  guardianEmail: string;
}

export async function admitStudent(i: AdmitInput): Promise<{ studentId: string; admissionNo: string }> {
  const rows = check(
    await supabase.rpc("admit_student", {
      p_first: i.firstName,
      p_middle: i.middleName,
      p_last: i.lastName,
      p_dob: i.dateOfBirth || null,
      p_gender: i.gender,
      p_class: i.classId || null,
      p_medical: i.medicalNotes,
      p_guardian_id: i.existingGuardianId,
      p_guardian_name: i.guardianName,
      p_guardian_phone: normalizePhone(i.guardianPhone),
      p_guardian_relationship: i.guardianRelationship,
      p_guardian_email: i.guardianEmail,
    }),
  );
  const row = rows[0];
  return { studentId: row.student_id, admissionNo: row.admission_no };
}

// ─── One student ─────────────────────────────────────────────────────────────

export interface StudentDetail {
  id: string;
  admissionNo: string;
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  status: StudentStatus;
  admittedOn: string;
  leftOn: string | null;
  leftReason: string | null;
  medicalNotes: string;
  enrollments: { id: string; className: string; yearName: string; yearId: string; sitsBece: boolean }[];
  guardians: { id: string; fullName: string; phone: string | null; relationship: string | null; isPrimary: boolean }[];
  bece: { examYear: number; indexNumber: string | null }[];
}

export async function getStudent(id: string): Promise<StudentDetail | null> {
  const res = await supabase
    .from("students")
    .select(
      `id, admission_no, first_name, middle_name, last_name, date_of_birth, gender, status, admitted_on,
       left_on, left_reason, medical_notes,
       enrollments(id, academic_year_id, academic_years(name, start_date), classes(section, levels(name, sits_bece))),
       student_guardians(is_primary, guardians(id, full_name, phone, relationship)),
       bece_registrations(exam_year, index_number)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw res.error;
  const r = res.data;
  if (!r) return null;

  type Enr = {
    id: string;
    academic_year_id: string;
    academic_years: { name: string; start_date: string } | { name: string; start_date: string }[] | null;
    classes: { section: string; levels: { name: string; sits_bece: boolean } | { name: string; sits_bece: boolean }[] | null } | null;
  };
  const enrollments = ((r.enrollments ?? []) as unknown as Enr[])
    .map((e) => {
      const year = Array.isArray(e.academic_years) ? e.academic_years[0] : e.academic_years;
      const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
      const level = cls ? (Array.isArray(cls.levels) ? cls.levels[0] : cls.levels) : null;
      return {
        id: e.id,
        yearId: e.academic_year_id,
        yearName: year?.name ?? "",
        start: year?.start_date ?? "",
        className: `${level?.name ?? ""} ${cls?.section ?? ""}`.trim(),
        sitsBece: level?.sits_bece ?? false,
      };
    })
    .sort((a, b) => b.start.localeCompare(a.start))
    .map(({ start: _start, ...rest }) => rest);

  type SG = { is_primary: boolean; guardians: { id: string; full_name: string; phone: string | null; relationship: string | null } | null };
  const guardians = ((r.student_guardians ?? []) as unknown as SG[])
    .filter((x) => x.guardians)
    .map((x) => ({
      id: x.guardians!.id,
      fullName: x.guardians!.full_name,
      phone: x.guardians!.phone,
      relationship: x.guardians!.relationship,
      isPrimary: x.is_primary,
    }));

  return {
    id: r.id,
    admissionNo: r.admission_no,
    firstName: r.first_name,
    middleName: r.middle_name ?? "",
    lastName: r.last_name,
    dateOfBirth: r.date_of_birth,
    gender: r.gender as Gender | null,
    status: r.status as StudentStatus,
    admittedOn: r.admitted_on,
    leftOn: r.left_on,
    leftReason: r.left_reason,
    medicalNotes: r.medical_notes ?? "",
    enrollments,
    guardians,
    bece: ((r.bece_registrations ?? []) as { exam_year: number; index_number: string | null }[]).map((b) => ({
      examYear: b.exam_year,
      indexNumber: b.index_number,
    })),
  };
}

export async function updateStudent(
  id: string,
  p: { firstName: string; middleName: string; lastName: string; dateOfBirth: string; gender: Gender; medicalNotes: string },
) {
  check(
    await supabase
      .from("students")
      .update({
        first_name: p.firstName,
        middle_name: p.middleName || null,
        last_name: p.lastName,
        date_of_birth: p.dateOfBirth || null,
        gender: p.gender,
        medical_notes: p.medicalNotes || null,
      })
      .eq("id", id),
  );
}

/** Mark a student as having completed school or left. The admission number stays with them and is never reused. */
export async function closeStudent(id: string, status: "completed" | "left", on: string, reason: string) {
  check(await supabase.from("students").update({ status, left_on: on, left_reason: reason || null }).eq("id", id));
  check(await supabase.from("enrollments").update({ status }).eq("student_id", id).eq("status", "enrolled"));
}

export async function reopenStudent(id: string) {
  check(await supabase.from("students").update({ status: "active", left_on: null, left_reason: null }).eq("id", id));
}

/** The school types in the BECE index number once it is issued. */
export async function saveBeceIndex(studentId: string, examYear: number, indexNumber: string) {
  check(
    await supabase
      .from("bece_registrations")
      .upsert(
        { student_id: studentId, exam_year: examYear, index_number: indexNumber || null },
        { onConflict: "student_id,exam_year" },
      ),
  );
}
