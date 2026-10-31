// Data layer for students. RLS decides which students each role can see, so a
// teacher's list contains only the pupils they teach.
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export type StudentStatus = "active" | "completed" | "left";
export type Gender = "female" | "male";

// ─── Choices used by the admission form ──────────────────────────────────────

export const RELIGIONS = ["Christian", "Muslim", "Traditional", "Other", "None"];
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
export const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Uncle or aunt", "Sibling", "Other"];
export const TRANSPORT_MODES: { value: string; label: string }[] = [
  { value: "walk", label: "Walks to school" },
  { value: "school_bus", label: "School bus" },
  { value: "private_car", label: "Private car" },
  { value: "public_transport", label: "Public transport" },
  { value: "other", label: "Other" },
];
export const DOCUMENTS: { value: string; label: string }[] = [
  { value: "birth_certificate", label: "Birth certificate" },
  { value: "passport_photo", label: "Passport photo" },
  { value: "previous_report", label: "Previous school report" },
  { value: "immunisation_card", label: "Immunisation card" },
  { value: "nhis_card", label: "NHIS card" },
];

// ─── The student's own fields (shared by admission and editing) ──────────────

export interface StudentFields {
  firstName: string;
  middleName: string;
  lastName: string;
  dateOfBirth: string;
  gender: Gender | "";
  placeOfBirth: string;
  nationality: string;
  religion: string;
  homeLanguage: string;
  residenceAddress: string;
  birthCertNo: string;
  nhisNo: string;
  bloodGroup: string;
  allergies: string;
  medicalNotes: string;
  specialNeeds: string;
  previousSchool: string;
  previousClass: string;
  previousSchoolReason: string;
  transportMode: string;
  consentMedical: boolean;
  consentPhoto: boolean;
  documentsReceived: string[];
  admittedOn: string;
}

export function emptyStudentFields(): StudentFields {
  return {
    firstName: "", middleName: "", lastName: "", dateOfBirth: "", gender: "",
    placeOfBirth: "", nationality: "Ghanaian", religion: "", homeLanguage: "", residenceAddress: "",
    birthCertNo: "", nhisNo: "", bloodGroup: "", allergies: "", medicalNotes: "", specialNeeds: "",
    previousSchool: "", previousClass: "", previousSchoolReason: "", transportMode: "",
    consentMedical: false, consentPhoto: false, documentsReceived: [], admittedOn: "",
  };
}

const t = (v: string) => v.trim();

function toColumns(f: StudentFields) {
  return {
    first_name: t(f.firstName),
    middle_name: t(f.middleName),
    last_name: t(f.lastName),
    date_of_birth: f.dateOfBirth,
    gender: f.gender,
    admitted_on: f.admittedOn,
    place_of_birth: t(f.placeOfBirth),
    nationality: t(f.nationality),
    religion: f.religion,
    home_language: t(f.homeLanguage),
    residence_address: t(f.residenceAddress),
    birth_cert_no: t(f.birthCertNo),
    nhis_no: t(f.nhisNo),
    blood_group: f.bloodGroup,
    allergies: t(f.allergies),
    medical_notes: t(f.medicalNotes),
    special_needs: t(f.specialNeeds),
    previous_school: t(f.previousSchool),
    previous_class: t(f.previousClass),
    previous_school_reason: t(f.previousSchoolReason),
    transport_mode: f.transportMode,
    consent_medical: f.consentMedical,
    consent_photo: f.consentPhoto,
    documents_received: f.documentsReceived,
  };
}

// ─── The list ────────────────────────────────────────────────────────────────

export interface StudentRow {
  id: string;
  admissionNo: string;
  fullName: string;
  gender: Gender | null;
  status: StudentStatus;
  photoPath: string | null;
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
      `id, admission_no, first_name, middle_name, last_name, gender, status, photo_url,
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
      photoPath: r.photo_url as string | null,
      className: current ? classLabel(current.classes) : null,
    };
  });
  return { rows, total: res.count ?? rows.length };
}

// ─── Photos ──────────────────────────────────────────────────────────────────
// Private bucket; the browser only ever holds short-lived signed links.

const PHOTO_BUCKET = "student-photos";
const PHOTO_TTL_SECONDS = 3600;

/** Signed links for several photos at once, keyed by storage path. */
export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_TTL_SECONDS);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) out[item.path] = item.signedUrl;
  }
  return out;
}

/** Store a (already resized) photo and record its path on the student. */
export async function uploadStudentPhoto(studentId: string, photo: Blob): Promise<string> {
  const path = `${studentId}/photo.jpg`;
  const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (up.error) throw up.error;
  check(await supabase.from("students").update({ photo_url: path }).eq("id", studentId));
  return path;
}

export async function removeStudentPhoto(studentId: string) {
  const path = `${studentId}/photo.jpg`;
  const rm = await supabase.storage.from(PHOTO_BUCKET).remove([path]);
  if (rm.error) throw rm.error;
  check(await supabase.from("students").update({ photo_url: null }).eq("id", studentId));
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

export interface GuardianEntry {
  /** Set when an existing guardian is reused (a sibling's parent). */
  existingId: string | null;
  fullName: string;
  relationship: string;
  phone: string;
  email: string;
  occupation: string;
  employer: string;
  address: string;
  isPrimary: boolean;
  isFeePayer: boolean;
  isEmergencyContact: boolean;
  canPickup: boolean;
}

export function emptyGuardian(relationship = "Mother", primary = false): GuardianEntry {
  return {
    existingId: null, fullName: "", relationship, phone: "", email: "", occupation: "", employer: "",
    address: "", isPrimary: primary, isFeePayer: primary, isEmergencyContact: primary, canPickup: true,
  };
}

export async function admitStudent(
  fields: StudentFields,
  classId: string,
  guardians: GuardianEntry[],
): Promise<{ studentId: string; admissionNo: string }> {
  const people = guardians
    .filter((g) => g.existingId || g.fullName.trim())
    .map((g) => ({
      id: g.existingId,
      full_name: t(g.fullName),
      relationship: g.relationship,
      phone: normalizePhone(g.phone),
      email: t(g.email),
      occupation: t(g.occupation),
      employer: t(g.employer),
      address: t(g.address),
      is_primary: g.isPrimary,
      is_fee_payer: g.isFeePayer,
      is_emergency_contact: g.isEmergencyContact,
      can_pickup: g.canPickup,
    }));
  const rows = check(
    await supabase.rpc("admit_student", {
      p_student: toColumns(fields),
      p_class: classId || null,
      p_guardians: people,
    }),
  );
  const row = rows[0];
  return { studentId: row.student_id, admissionNo: row.admission_no };
}

// ─── One student ─────────────────────────────────────────────────────────────

export interface StudentDetail {
  id: string;
  admissionNo: string;
  status: StudentStatus;
  leftOn: string | null;
  leftReason: string | null;
  photoPath: string | null;
  fields: StudentFields;
  enrollments: { id: string; className: string; yearName: string; yearId: string; sitsBece: boolean }[];
  guardians: {
    id: string; fullName: string; phone: string | null; relationship: string | null; occupation: string | null;
    email: string | null; employer: string | null; address: string | null;
    isPrimary: boolean; isFeePayer: boolean; isEmergencyContact: boolean; canPickup: boolean;
  }[];
  bece: { examYear: number; indexNumber: string | null }[];
}

export async function getStudent(id: string): Promise<StudentDetail | null> {
  const res = await supabase
    .from("students")
    .select(
      `*,
       enrollments(id, academic_year_id, academic_years(name, start_date), classes(section, levels(name, sits_bece))),
       student_guardians(is_primary, is_fee_payer, is_emergency_contact, can_pickup,
         guardians(id, full_name, phone, relationship, occupation, email, employer, address)),
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

  type SG = {
    is_primary: boolean; is_fee_payer: boolean; is_emergency_contact: boolean; can_pickup: boolean;
    guardians: {
      id: string; full_name: string; phone: string | null; relationship: string | null; occupation: string | null;
      email: string | null; employer: string | null; address: string | null;
    } | null;
  };
  const guardians = ((r.student_guardians ?? []) as unknown as SG[])
    .filter((x) => x.guardians)
    .map((x) => ({
      id: x.guardians!.id,
      fullName: x.guardians!.full_name,
      phone: x.guardians!.phone,
      relationship: x.guardians!.relationship,
      occupation: x.guardians!.occupation,
      email: x.guardians!.email,
      employer: x.guardians!.employer,
      address: x.guardians!.address,
      isPrimary: x.is_primary,
      isFeePayer: x.is_fee_payer,
      isEmergencyContact: x.is_emergency_contact,
      canPickup: x.can_pickup,
    }));

  const s = (v: string | null | undefined) => v ?? "";
  return {
    id: r.id,
    admissionNo: r.admission_no,
    status: r.status as StudentStatus,
    leftOn: r.left_on,
    leftReason: r.left_reason,
    photoPath: r.photo_url,
    fields: {
      firstName: r.first_name, middleName: s(r.middle_name), lastName: r.last_name,
      dateOfBirth: s(r.date_of_birth), gender: (r.gender ?? "") as Gender | "",
      placeOfBirth: s(r.place_of_birth), nationality: s(r.nationality), religion: s(r.religion),
      homeLanguage: s(r.home_language), residenceAddress: s(r.residence_address),
      birthCertNo: s(r.birth_cert_no), nhisNo: s(r.nhis_no), bloodGroup: s(r.blood_group),
      allergies: s(r.allergies), medicalNotes: s(r.medical_notes), specialNeeds: s(r.special_needs),
      previousSchool: s(r.previous_school), previousClass: s(r.previous_class),
      previousSchoolReason: s(r.previous_school_reason), transportMode: s(r.transport_mode),
      consentMedical: r.consent_medical ?? false, consentPhoto: r.consent_photo ?? false,
      documentsReceived: (r.documents_received ?? []) as string[], admittedOn: s(r.admitted_on),
    },
    enrollments,
    guardians,
    bece: ((r.bece_registrations ?? []) as { exam_year: number; index_number: string | null }[]).map((b) => ({
      examYear: b.exam_year,
      indexNumber: b.index_number,
    })),
  };
}

export async function updateStudent(id: string, f: StudentFields) {
  const c = toColumns(f);
  // Empty text becomes null so cleared fields do not store blanks.
  const blank = (v: string) => (v === "" ? null : v);
  check(
    await supabase
      .from("students")
      .update({
        first_name: c.first_name,
        middle_name: blank(c.middle_name),
        last_name: c.last_name,
        date_of_birth: blank(c.date_of_birth),
        gender: f.gender || null,
        admitted_on: c.admitted_on || undefined,
        place_of_birth: blank(c.place_of_birth),
        nationality: blank(c.nationality),
        religion: blank(c.religion),
        home_language: blank(c.home_language),
        residence_address: blank(c.residence_address),
        birth_cert_no: blank(c.birth_cert_no),
        nhis_no: blank(c.nhis_no),
        blood_group: blank(c.blood_group),
        allergies: blank(c.allergies),
        medical_notes: blank(c.medical_notes),
        special_needs: blank(c.special_needs),
        previous_school: blank(c.previous_school),
        previous_class: blank(c.previous_class),
        previous_school_reason: blank(c.previous_school_reason),
        transport_mode: blank(c.transport_mode),
        consent_medical: c.consent_medical,
        consent_photo: c.consent_photo,
        documents_received: c.documents_received,
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

// ─── Managing an existing student ────────────────────────────────────────────

/** Move a student to another class in that class's year (or place them if they have none). */
export async function changeStudentClass(studentId: string, classId: string) {
  check(await supabase.rpc("change_student_class", { p_student: studentId, p_class: classId }));
}

function guardianJson(g: GuardianEntry) {
  return {
    id: g.existingId,
    full_name: t(g.fullName),
    relationship: g.relationship,
    phone: normalizePhone(g.phone),
    email: t(g.email),
    occupation: t(g.occupation),
    employer: t(g.employer),
    address: t(g.address),
    is_primary: g.isPrimary,
    is_fee_payer: g.isFeePayer,
    is_emergency_contact: g.isEmergencyContact,
    can_pickup: g.canPickup,
  };
}

export async function addStudentGuardian(studentId: string, g: GuardianEntry) {
  check(await supabase.rpc("add_student_guardian", { p_student: studentId, p_guardian: guardianJson(g) }));
}

/** Edit a guardian's details and what they are for this student. */
export async function updateStudentGuardian(studentId: string, guardianId: string, g: GuardianEntry) {
  const blank = (v: string) => (t(v) === "" ? null : t(v));
  check(
    await supabase
      .from("guardians")
      .update({
        full_name: t(g.fullName),
        phone: blank(normalizePhone(g.phone)),
        relationship: blank(g.relationship),
        email: blank(g.email),
        occupation: blank(g.occupation),
        employer: blank(g.employer),
        address: blank(g.address),
      })
      .eq("id", guardianId),
  );
  check(
    await supabase
      .from("student_guardians")
      .update({
        is_primary: g.isPrimary,
        is_fee_payer: g.isFeePayer,
        is_emergency_contact: g.isEmergencyContact,
        can_pickup: g.canPickup,
      })
      .eq("student_id", studentId)
      .eq("guardian_id", guardianId),
  );
}

export async function removeStudentGuardian(studentId: string, guardianId: string) {
  check(await supabase.rpc("remove_student_guardian", { p_student: studentId, p_guardian: guardianId }));
}

/**
 * Developer only, and only for a student with no history (a test or duplicate
 * admission). Anyone with attendance, grades or billing is archived instead.
 */
export async function deleteStudent(studentId: string, photoPath: string | null) {
  check(await supabase.rpc("delete_student_if_unused", { p_student: studentId }));
  // The record is gone; tidy the photo too. A leftover file is harmless, so ignore failure.
  if (photoPath) await supabase.storage.from(PHOTO_BUCKET).remove([photoPath]).catch(() => undefined);
}
