// Data layer for school setup: academic years, terms, classes, subjects and
// learning areas. school_id is never sent; the database fills it in from the
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
        "id, level_id, academic_year_id, section, class_teacher_id, levels(name, sort_order), staff(full_name), enrollments(count)",
      )
      .eq("academic_year_id", academicYearId),
  );
  return rows
    .map((r) => {
      const level = Array.isArray(r.levels) ? r.levels[0] : r.levels;
      const teacher = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      const enrol = Array.isArray(r.enrollments) ? r.enrollments[0] : r.enrollments;
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

// ─── Subjects and learning areas (customisable lists) ────────────────────────

export interface ListItem {
  id: string;
  name: string;
  isActive: boolean;
}

export type ListKind = "subjects" | "learning_areas";

export async function listItems(kind: ListKind): Promise<ListItem[]> {
  const order = kind === "subjects" ? "name" : "sort_order";
  const rows = check(await supabase.from(kind).select("id, name, is_active").order(order));
  return rows.map((r) => ({ id: r.id, name: r.name, isActive: r.is_active }));
}

export async function createItem(kind: ListKind, name: string) {
  if (kind === "learning_areas") {
    // Append after the current last one.
    const { data } = await supabase
      .from("learning_areas")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const next = (data?.[0]?.sort_order ?? 0) + 1;
    check(await supabase.from("learning_areas").insert({ name, sort_order: next }));
  } else {
    check(await supabase.from("subjects").insert({ name }));
  }
}

export async function updateItem(kind: ListKind, id: string, patch: { name?: string; isActive?: boolean }) {
  const body: { name?: string; is_active?: boolean } = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.isActive !== undefined) body.is_active = patch.isActive;
  check(await supabase.from(kind).update(body).eq("id", id));
}
