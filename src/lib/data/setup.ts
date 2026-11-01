// Data layer for school setup: academic years, terms, classes and
// and subjects. school_id is never sent; the database fills it in from the
// signed-in user and RLS rejects anything else.
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

// ─── Academic years and terms ────────────────────────────────────────────────

export interface AcademicYear {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface Term {
  id: string;
  academicYearId: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const rows = check(
    await supabase
      .from("academic_years")
      .select("id, name, start_date, end_date, is_current")
      .order("start_date", { ascending: false }),
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, startDate: r.start_date, endDate: r.end_date, isCurrent: r.is_current,
  }));
}

export async function createAcademicYear(input: { name: string; startDate: string; endDate: string }) {
  check(
    await supabase
      .from("academic_years")
      .insert({ name: input.name, start_date: input.startDate, end_date: input.endDate }),
  );
}

export async function setCurrentAcademicYear(id: string) {
  check(await supabase.rpc("set_current_academic_year", { p_year: id }));
}

export async function listTerms(): Promise<Term[]> {
  const rows = check(
    await supabase
      .from("terms")
      .select("id, academic_year_id, name, start_date, end_date, is_current")
      .order("start_date", { ascending: true }),
  );
  return rows.map((r) => ({
    id: r.id, academicYearId: r.academic_year_id, name: r.name,
    startDate: r.start_date, endDate: r.end_date, isCurrent: r.is_current,
  }));
}

export async function createTerm(input: { academicYearId: string; name: string; startDate: string; endDate: string }) {
  check(
    await supabase.from("terms").insert({
      academic_year_id: input.academicYearId,
      name: input.name,
      start_date: input.startDate,
      end_date: input.endDate,
    }),
  );
}

export async function setCurrentTerm(id: string) {
  check(await supabase.rpc("set_current_term", { p_term: id }));
}

// ─── Levels and classes ──────────────────────────────────────────────────────

export interface Level {
  id: string;
  name: string;
  sortOrder: number;
}

export interface SchoolClass {
  id: string;
  levelId: string;
  levelName: string;
  levelOrder: number;
  academicYearId: string;
  section: string;
  classTeacherId: string | null;
  classTeacherName: string | null;
  studentCount: number;
  subjectCount: number;
}

export interface StaffOption {
  id: string;
  fullName: string;
}

export async function listLevels(): Promise<Level[]> {
  const rows = check(await supabase.from("levels").select("id, name, sort_order").order("sort_order"));
  return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

export async function listTeachers(): Promise<StaffOption[]> {
  const rows = check(
    await supabase
      .from("staff")
      .select("id, full_name")
      .eq("type", "teaching")
      .eq("status", "active")
      .order("full_name"),
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
}

export async function listClasses(academicYearId: string): Promise<SchoolClass[]> {
  const rows = check(
    await supabase
      .from("classes")
      .select(
        "id, level_id, academic_year_id, section, class_teacher_id, levels(name, sort_order), staff(full_name), enrollments(count), class_subjects(count)",
      )
      .eq("academic_year_id", academicYearId),
  );
  return rows
    .map((r) => {
      const level = Array.isArray(r.levels) ? r.levels[0] : r.levels;
      const teacher = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      const enrol = Array.isArray(r.enrollments) ? r.enrollments[0] : r.enrollments;
      const subj = Array.isArray(r.class_subjects) ? r.class_subjects[0] : r.class_subjects;
      return {
        id: r.id,
        levelId: r.level_id,
        levelName: level?.name ?? "",
        levelOrder: level?.sort_order ?? 0,
        academicYearId: r.academic_year_id,
        section: r.section,
        classTeacherId: r.class_teacher_id,
        classTeacherName: teacher?.full_name ?? null,
        studentCount: enrol?.count ?? 0,
        subjectCount: subj?.count ?? 0,
      };
    })
    .sort((a, b) => a.levelOrder - b.levelOrder || a.section.localeCompare(b.section));
}

export async function createClass(input: {
  levelId: string;
  academicYearId: string;
  section: string;
  classTeacherId: string | null;
}) {
  check(
    await supabase.from("classes").insert({
      level_id: input.levelId,
      academic_year_id: input.academicYearId,
      section: input.section,
      class_teacher_id: input.classTeacherId,
    }),
  );
}

export async function setClassTeacher(classId: string, staffId: string | null) {
  check(await supabase.from("classes").update({ class_teacher_id: staffId }).eq("id", classId));
}

// ─── Subjects (customisable list) ────────────────────────────────────────────
// One list for subjects and learning areas: a creche to KG 2 learning area is a
// subject graded with written remarks. The level's grading scale decides how.

export interface ListItem {
  id: string;
  name: string;
  isActive: boolean;
}

export async function listSubjects(): Promise<ListItem[]> {
  const rows = check(await supabase.from("subjects").select("id, name, is_active").order("name"));
  return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active }));
}

export async function createSubject(name: string) {
  check(await supabase.from("subjects").insert({ name }));
}

export async function updateSubject(id: string, patch: { name?: string; isActive?: boolean }) {
  const body: { name?: string; is_active?: boolean } = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  check(await supabase.from("subjects").update(body).eq("id", id));
}

// ─── Subjects per class ──────────────────────────────────────────────────────
// Each class has its own subject list (a subject may start at a later level),
// and each subject in a class has its own teacher.

export interface ClassSubject {
  id: string;
  subjectId: string;
  teacherId: string | null;
}

export interface ClassOption {
  id: string;
  label: string;
  subjectCount: number;
}

export async function listClassSubjects(classId: string): Promise<ClassSubject[]> {
  const rows = check(
    await supabase.from("class_subjects").select("id, subject_id, teacher_id").eq("class_id", classId),
  );
  return rows.map((r) => ({ id: r.id, subjectId: r.subject_id, teacherId: r.teacher_id }));
}

export async function addClassSubjects(classId: string, subjectIds: string[], teacherId: string | null = null) {
  if (subjectIds.length === 0) return;
  check(
    await supabase.from("class_subjects").upsert(
      subjectIds.map((subject_id) => ({ class_id: classId, subject_id, teacher_id: teacherId })),
      { onConflict: "class_id,subject_id", ignoreDuplicates: true },
    ),
  );
}

export async function removeClassSubject(id: string) {
  check(await supabase.from("class_subjects").delete().eq("id", id));
}

export async function setSubjectTeacher(id: string, staffId: string | null) {
  check(await supabase.from("class_subjects").update({ teacher_id: staffId }).eq("id", id));
}

/** Give every subject in a class the same teacher (a class teacher in the lower levels). */
export async function setAllSubjectTeachers(classId: string, staffId: string | null) {
  check(await supabase.from("class_subjects").update({ teacher_id: staffId }).eq("class_id", classId));
}

/** Other classes of the same level, in any year, to copy a subject list from. */
export async function listCopySources(levelId: string, excludeClassId: string): Promise<ClassOption[]> {
  const rows = check(
    await supabase
      .from("classes")
      .select("id, section, academic_years(name, start_date), levels(name), class_subjects(count)")
      .eq("level_id", levelId)
      .neq("id", excludeClassId),
  );
  return rows
    .map((r) => {
      const year = Array.isArray(r.academic_years) ? r.academic_years[0] : r.academic_years;
      const level = Array.isArray(r.levels) ? r.levels[0] : r.levels;
      const subj = Array.isArray(r.class_subjects) ? r.class_subjects[0] : r.class_subjects;
      return {
        id: r.id,
        label: `${level?.name ?? ""} ${r.section} (${year?.name ?? ""})`,
        subjectCount: subj?.count ?? 0,
        start: year?.start_date ?? "",
      };
    })
    .filter((o) => o.subjectCount > 0)
    .sort((a, b) => b.start.localeCompare(a.start))
    .map(({ id, label, subjectCount }) => ({ id, label, subjectCount }));
}

/** Copy the subjects (not the teachers) from one class to another, skipping any already there. */
export async function copyClassSubjects(fromClassId: string, toClassId: string) {
  const source = await listClassSubjects(fromClassId);
  await addClassSubjects(toClassId, source.map((s) => s.subjectId));
}

// ─── Editing and deleting ────────────────────────────────────────────────────

/** A delete that removed nothing was refused by the access rules (no error is raised for that). */
function deleted(res: { data: unknown[] | null; error: unknown }) {
  if (res.error) throw res.error;
  if (!res.data || res.data.length === 0) throw { code: "42501" };
}

// Editing is for admins. Deleting is for developers, and the database refuses it
// while anything depends on the record.

export async function updateAcademicYear(id: string, p: { name: string; startDate: string; endDate: string }) {
  check(await supabase.from("academic_years").update({ name: p.name, start_date: p.startDate, end_date: p.endDate }).eq("id", id));
}

export async function deleteAcademicYear(id: string) {
  deleted(await supabase.from("academic_years").delete().eq("id", id).select("id"));
}

export async function updateTerm(id: string, p: { name: string; startDate: string; endDate: string }) {
  check(await supabase.from("terms").update({ name: p.name, start_date: p.startDate, end_date: p.endDate }).eq("id", id));
}

export async function deleteTerm(id: string) {
  deleted(await supabase.from("terms").delete().eq("id", id).select("id"));
}

export async function updateClassSection(id: string, section: string) {
  check(await supabase.from("classes").update({ section }).eq("id", id));
}

export async function deleteClass(id: string) {
  deleted(await supabase.from("classes").delete().eq("id", id).select("id"));
}

export async function deleteSubject(id: string) {
  deleted(await supabase.from("subjects").delete().eq("id", id).select("id"));
}

// ─── School / Institution details (displayed on receipts, invoices & reports) ─

export interface InstitutionDetails {
  id: string;
  name: string;
  logoUrl: string | null;
  motto: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  taxOrRegNo: string;
  currency: string;
  brandPrimary: string | null;
  receiptFooter: string;
  bankDetails: string;
}

export async function getInstitutionDetails(): Promise<InstitutionDetails> {
  const r = check(
    await supabase
      .from("schools")
      .select(
        "id, name, logo_url, motto, address, phone, email, website, tax_or_reg_no, currency, brand_colors, receipt_footer, bank_details",
      )
      .single(),
  );
  const brand = (r.brand_colors ?? {}) as { primary?: string };
  return {
    id: r.id,
    name: r.name ?? "",
    logoUrl: r.logo_url ?? null,
    motto: r.motto ?? "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
    website: r.website ?? "",
    taxOrRegNo: r.tax_or_reg_no ?? "",
    currency: r.currency ?? "GHS",
    brandPrimary: brand.primary ?? null,
    receiptFooter: r.receipt_footer ?? "",
    bankDetails: r.bank_details ?? "",
  };
}

export async function updateInstitutionDetails(
  id: string,
  input: Omit<InstitutionDetails, "id">,
): Promise<void> {
  const brandColors: Record<string, string> = {};
  if (input.brandPrimary && input.brandPrimary.trim()) {
    brandColors.primary = input.brandPrimary.trim();
  }
  check(
    await supabase
      .from("schools")
      .update({
        name: input.name.trim(),
        logo_url: input.logoUrl || null,
        motto: input.motto.trim() || null,
        address: input.address.trim() || null,
        phone: input.phone.trim() || null,
        email: input.email.trim() || null,
        website: input.website.trim() || null,
        tax_or_reg_no: input.taxOrRegNo.trim() || null,
        currency: input.currency.trim() || "GHS",
        brand_colors: brandColors,
        receipt_footer: input.receiptFooter.trim() || null,
        bank_details: input.bankDetails.trim() || null,
      })
      .eq("id", id),
  );

}
