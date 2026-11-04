// Data layer for the Gradebook, configurable grading scales, and Report Cards.
// RLS enforces read access (can_view_enrollment) and write access
// (can_teach_enrollment / teaches_class_subject / school_admin).
import { supabase } from "../supabase";

function check<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  return res.data as NonNullable<T>;
}

export type GradingType = "ges_numeric" | "custom_numeric" | "descriptive" | "checklist";

export type AssessmentType =
  | "class_exercise"
  | "homework"
  | "project"
  | "ca_test"
  | "exam";

export const ASSESSMENT_TYPES: {
  value: AssessmentType;
  label: string;
  isExam: boolean;
}[] = [
  { value: "class_exercise", label: "Class exercise", isExam: false },
  { value: "homework", label: "Homework", isExam: false },
  { value: "project", label: "Project / Group work", isExam: false },
  { value: "ca_test", label: "CA / Mid-term test", isExam: false },
  { value: "exam", label: "End of term exam", isExam: true },
];

export const CHECKLIST_PRESETS = [
  "Mastering — Consistently demonstrates skill independently",
  "Developing — Progressing steadily with occasional guidance",
  "Beginning — Emerging understanding; needs regular support",
  "Not yet observed — Requires focused one-on-one attention",
];

export interface GradeBand {
  id: string;
  minScore: number;
  maxScore: number;
  grade: string;
  remark: string;
}

export interface GradingScale {
  id: string;
  name: string;
  type: GradingType;
  bands: GradeBand[];
}

export interface LevelWithScale {
  id: string;
  name: string;
  sortOrder: number;
  sitsBece: boolean;
  gradingScaleId: string | null;
  scaleName: string | null;
  gradingType: GradingType;
}

export interface ClassSubjectDetail {
  id: string;
  classId: string;
  subjectId: string;
  subjectName: string;
  teacherId: string | null;
  teacherName: string | null;
}

export interface Assessment {
  id: string;
  classSubjectId: string;
  termId: string;
  type: AssessmentType;
  title: string;
  maxScore: number;
  weight: number;
  /** The exam period this belongs to, if any. A period can limit when marks may be entered. */
  examPeriodId: string | null;
}

export interface GradebookStudentRow {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  fullName: string;
  photoPath: string | null;
  scores: Record<string, number | null>;
  caTotal: number | null;
  examScore: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
  descriptiveRemark: string;
}

export interface BroadsheetStudentSubject {
  subjectId: string;
  subjectName: string;
  caTotal: number | null;
  examScore: number | null;
  total: number | null;
  grade: string | null;
  remark: string | null;
  descriptiveRemark: string | null;
}

export interface BroadsheetStudent {
  enrollmentId: string;
  studentId: string;
  admissionNo: string;
  fullName: string;
  photoPath: string | null;
  subjectsGraded: number;
  totalSubjects: number;
  averageScore: number | null;
  rank: number | null;
  bestSixAggregate: number | null;
  overallRemark: string;
  attendance: {
    present: number;
    late: number;
    excused: number;
    absent: number;
    total: number;
  };
  subjects: BroadsheetStudentSubject[];
}

export interface ClassBroadsheet {
  classId: string;
  className: string;
  levelName: string;
  sitsBece: boolean;
  classTeacherName: string | null;
  academicYearName: string;
  termId: string;
  termName: string;
  termStartDate: string;
  termEndDate: string;
  gradingType: GradingType;
  scaleName: string;
  bands: GradeBand[];
  subjects: { id: string; name: string }[];
  students: BroadsheetStudent[];
}

// ─── Grading Scales & Level Configuration ────────────────────────────────────

export async function listGradingScales(): Promise<GradingScale[]> {
  const rows = check(
    await supabase
      .from("grading_scales")
      .select("id, name, type, grade_bands(id, min_score, max_score, grade, remark)")
      .order("name"),
  );

  return rows.map((r) => {
    const rawBands = (Array.isArray(r.grade_bands) ? r.grade_bands : []) as {
      id: string;
      min_score: number;
      max_score: number;
      grade: string;
      remark: string;
    }[];
    return {
      id: r.id,
      name: r.name,
      type: r.type as GradingType,
      bands: rawBands
        .map((b) => ({
          id: b.id,
          minScore: Number(b.min_score),
          maxScore: Number(b.max_score),
          grade: b.grade,
          remark: b.remark,
        }))
        .sort((a, b) => b.minScore - a.minScore),
    };
  });
}

export async function listLevelsWithScales(): Promise<LevelWithScale[]> {
  const rows = check(
    await supabase
      .from("levels")
      .select("id, name, sort_order, sits_bece, grading_scale_id, grading_scales(id, name, type)")
      .order("sort_order"),
  );

  return rows.map((r) => {
    const gs = Array.isArray(r.grading_scales) ? r.grading_scales[0] : r.grading_scales;
    return {
      id: r.id,
      name: r.name,
      sortOrder: r.sort_order,
      sitsBece: r.sits_bece,
      gradingScaleId: r.grading_scale_id,
      scaleName: gs?.name ?? null,
      gradingType: (gs?.type as GradingType | undefined) ?? "ges_numeric",
    };
  });
}

export async function setLevelGradingScale(
  levelId: string,
  gradingScaleId: string,
): Promise<void> {
  check(
    await supabase
      .from("levels")
      .update({ grading_scale_id: gradingScaleId })
      .eq("id", levelId),
  );
}

export async function createGradingScale(input: {
  name: string;
  type: GradingType;
  bands?: { minScore: number; maxScore: number; grade: string; remark: string }[];
}): Promise<string> {
  const row = check(
    await supabase
      .from("grading_scales")
      .insert({ name: input.name.trim(), type: input.type })
      .select("id")
      .single(),
  );

  if (input.bands && input.bands.length > 0) {
    check(
      await supabase.from("grade_bands").insert(
        input.bands.map((b) => ({
          scale_id: row.id,
          min_score: b.minScore,
          max_score: b.maxScore,
          grade: b.grade.trim(),
          remark: b.remark.trim(),
        })),
      ),
    );
  }

  return row.id;
}

export async function saveGradeBands(
  scaleId: string,
  bands: { minScore: number; maxScore: number; grade: string; remark: string }[],
): Promise<void> {
  check(await supabase.from("grade_bands").delete().eq("scale_id", scaleId));
  if (bands.length > 0) {
    check(
      await supabase.from("grade_bands").insert(
        bands.map((b) => ({
          scale_id: scaleId,
          min_score: b.minScore,
          max_score: b.maxScore,
          grade: b.grade.trim(),
          remark: b.remark.trim(),
        })),
      ),
    );
  }
}

// ─── Teacher & Class Subject Resolution ──────────────────────────────────────

export interface TeachingAssignments {
  staffId: string | null;
  classTeacherClassIds: Set<string>;
  subjectTeacherClassSubjectIds: Set<string>;
  teachableClassIds: Set<string>;
}

export async function getMyTeachingAssignments(
  userId: string,
  academicYearId: string,
): Promise<TeachingAssignments> {
  const { data: staffRow } = await supabase
    .from("staff")
    .select("id")
    .eq("profile_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!staffRow?.id) {
    return {
      staffId: null,
      classTeacherClassIds: new Set(),
      subjectTeacherClassSubjectIds: new Set(),
      teachableClassIds: new Set(),
    };
  }

  const staffId = staffRow.id;
  const [{ data: directClasses }, { data: subjectClasses }] = await Promise.all([
    supabase
      .from("classes")
      .select("id")
      .eq("academic_year_id", academicYearId)
      .eq("class_teacher_id", staffId),
    supabase
      .from("class_subjects")
      .select("id, class_id, classes!inner(academic_year_id)")
      .eq("teacher_id", staffId)
      .eq("classes.academic_year_id", academicYearId),
  ]);

  const classTeacherClassIds = new Set<string>();
  const subjectTeacherClassSubjectIds = new Set<string>();
  const teachableClassIds = new Set<string>();

  for (const c of directClasses ?? []) {
    classTeacherClassIds.add(c.id);
    teachableClassIds.add(c.id);
  }
  for (const cs of subjectClasses ?? []) {
    subjectTeacherClassSubjectIds.add(cs.id);
    teachableClassIds.add(cs.class_id);
  }

  return {
    staffId,
    classTeacherClassIds,
    subjectTeacherClassSubjectIds,
    teachableClassIds,
  };
}

export async function listClassSubjectsWithDetails(
  classId: string,
): Promise<ClassSubjectDetail[]> {
  const rows = check(
    await supabase
      .from("class_subjects")
      .select("id, class_id, subject_id, teacher_id, subjects(name), staff(full_name)")
      .eq("class_id", classId),
  );

  return rows
    .map((r) => {
      const subj = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
      const teacher = Array.isArray(r.staff) ? r.staff[0] : r.staff;
      return {
        id: r.id,
        classId: r.class_id,
        subjectId: r.subject_id,
        subjectName: subj?.name ?? "Subject",
        teacherId: r.teacher_id,
        teacherName: teacher?.full_name ?? null,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

export async function getClassGradingConfig(classId: string): Promise<{
  classId: string;
  section: string;
  levelId: string;
  levelName: string;
  sitsBece: boolean;
  scaleId: string | null;
  scaleName: string;
  gradingType: GradingType;
  bands: GradeBand[];
}> {
  const row = check(
    await supabase
      .from("classes")
      .select(
        "id, section, levels!inner(id, name, sits_bece, grading_scale_id, grading_scales(id, name, type, grade_bands(id, min_score, max_score, grade, remark)))",
      )
      .eq("id", classId)
      .single(),
  );

  const lvl = Array.isArray(row.levels) ? row.levels[0] : row.levels;
  const gs = lvl
    ? Array.isArray(lvl.grading_scales)
      ? lvl.grading_scales[0]
      : lvl.grading_scales
    : null;
  const rawBands = (gs && Array.isArray(gs.grade_bands) ? gs.grade_bands : []) as {
    id: string;
    min_score: number;
    max_score: number;
    grade: string;
    remark: string;
  }[];

  return {
    classId: row.id,
    section: row.section,
    levelId: lvl?.id ?? "",
    levelName: lvl?.name ?? "",
    sitsBece: Boolean(lvl?.sits_bece),
    scaleId: gs?.id ?? null,
    scaleName: gs?.name ?? "GES Basic (1-7)",
    gradingType: (gs?.type as GradingType | undefined) ?? "ges_numeric",
    bands: rawBands
      .map((b) => ({
        id: b.id,
        minScore: Number(b.min_score),
        maxScore: Number(b.max_score),
        grade: b.grade,
        remark: b.remark,
      }))
      .sort((a, b) => b.minScore - a.minScore),
  };
}

// ─── Assessments & Subject Gradebook ─────────────────────────────────────────

export async function listAssessments(
  classSubjectId: string,
  termId: string,
): Promise<Assessment[]> {
  const rows = check(
    await supabase
      .from("assessments")
      .select("id, class_subject_id, term_id, type, title, max_score, weight, exam_period_id, created_at")
      .eq("class_subject_id", classSubjectId)
      .eq("term_id", termId)
      .order("created_at", { ascending: true }),
  );

  return rows.map((r) => ({
    id: r.id,
    classSubjectId: r.class_subject_id,
    termId: r.term_id,
    type: r.type as AssessmentType,
    title:
      r.title ||
      ASSESSMENT_TYPES.find((t) => t.value === r.type)?.label ||
      r.type,
    maxScore: Number(r.max_score),
    weight: Number(r.weight),
    examPeriodId: (r.exam_period_id as string | null) ?? null,
  }));
}

export async function createAssessment(input: {
  classSubjectId: string;
  termId: string;
  type: AssessmentType;
  title: string;
  maxScore: number;
  weight: number;
  examPeriodId?: string | null;
}): Promise<void> {
  check(
    await supabase.from("assessments").insert({
      exam_period_id: input.examPeriodId || null,
      class_subject_id: input.classSubjectId,
      term_id: input.termId,
      type: input.type,
      title: input.title.trim() || null,
      max_score: input.maxScore,
      weight: input.weight,
    }),
  );
}

/**
 * Creates a standard GES assessment structure (Class Work 10% + Mid-Term CA 20% + Exam 70% = 100%)
 * for a subject in one click.
 */
export async function createStandardGesAssessments(
  classSubjectId: string,
  termId: string,
): Promise<void> {
  check(
    await supabase.from("assessments").insert([
      {
        class_subject_id: classSubjectId,
        term_id: termId,
        type: "class_exercise",
        title: "Class Work & Homework",
        max_score: 20,
        weight: 10,
      },
      {
        class_subject_id: classSubjectId,
        term_id: termId,
        type: "ca_test",
        title: "Mid-Term CA Test",
        max_score: 20,
        weight: 20,
      },
      {
        class_subject_id: classSubjectId,
        term_id: termId,
        type: "exam",
        title: "End of Term Exam",
        max_score: 100,
        weight: 70,
      },
    ]),
  );
}

export async function deleteAssessment(id: string): Promise<void> {
  check(await supabase.from("assessments").delete().eq("id", id));
}

export async function getSubjectGradebook(
  classId: string,
  classSubjectId: string,
  subjectId: string,
  termId: string,
): Promise<{
  assessments: Assessment[];
  students: GradebookStudentRow[];
}> {
  const [assessments, enrollments] = await Promise.all([
    listAssessments(classSubjectId, termId),
    supabase
      .from("enrollments")
      .select(
        "id, student_id, students!inner(id, admission_no, first_name, middle_name, last_name, photo_url, status, deleted_at)",
      )
      .eq("class_id", classId)
      .eq("status", "enrolled")
      .eq("students.status", "active")
      .is("students.deleted_at", null)
      .then(check),
  ]);

  if (enrollments.length === 0) {
    return { assessments, students: [] };
  }

  const enrollmentIds = enrollments.map((e) => e.id);
  const assessmentIds = assessments.map((a) => a.id);

  const [scoresRows, resultRows, remarkRows] = await Promise.all([
    assessmentIds.length > 0
      ? supabase
          .from("scores")
          .select("assessment_id, enrollment_id, score")
          .in("assessment_id", assessmentIds)
          .in("enrollment_id", enrollmentIds)
          .then(check)
      : Promise.resolve([]),
    supabase
      .from("term_results")
      .select("enrollment_id, ca_total, exam_score, total, grade, remark")
      .eq("term_id", termId)
      .eq("subject_id", subjectId)
      .in("enrollment_id", enrollmentIds)
      .then(check),
    supabase
      .from("term_remarks")
      .select("enrollment_id, remark")
      .eq("term_id", termId)
      .eq("subject_id", subjectId)
      .in("enrollment_id", enrollmentIds)
      .then(check),
  ]);

  const scoresByEnrollment = new Map<string, Record<string, number | null>>();
  for (const s of scoresRows) {
    const map = scoresByEnrollment.get(s.enrollment_id) ?? {};
    map[s.assessment_id] = Number(s.score);
    scoresByEnrollment.set(s.enrollment_id, map);
  }

  const resultByEnrollment = new Map(resultRows.map((r) => [r.enrollment_id, r]));
  const remarkByEnrollment = new Map(remarkRows.map((r) => [r.enrollment_id, r.remark]));

  type StudentJoined = {
    id: string;
    admission_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    photo_url: string | null;
  };

  const students = enrollments
    .map((e) => {
      const s = (Array.isArray(e.students) ? e.students[0] : e.students) as StudentJoined;
      const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
      const res = resultByEnrollment.get(e.id);
      const scoreMap = scoresByEnrollment.get(e.id) ?? {};
      const fullScores: Record<string, number | null> = {};
      for (const a of assessments) {
        fullScores[a.id] = scoreMap[a.id] ?? null;
      }

      return {
        enrollmentId: e.id,
        studentId: s.id,
        admissionNo: s.admission_no,
        fullName,
        lastName: s.last_name,
        firstName: s.first_name,
        photoPath: s.photo_url,
        scores: fullScores,
        caTotal: res ? Number(res.ca_total) : null,
        examScore: res ? Number(res.exam_score) : null,
        total: res ? Number(res.total) : null,
        grade: res?.grade ?? null,
        remark: res?.remark ?? null,
        descriptiveRemark: remarkByEnrollment.get(e.id) ?? "",
      };
    })
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.admissionNo.localeCompare(b.admissionNo),
    )
    .map(({ lastName: _l, firstName: _f, ...rest }) => rest);

  return { assessments, students };
}

export async function saveSubjectScores(
  entries: { assessmentId: string; enrollmentId: string; score: number | null }[],
): Promise<void> {
  const toUpsert = entries
    .filter(
      (e): e is { assessmentId: string; enrollmentId: string; score: number } =>
        e.score !== null && !Number.isNaN(e.score),
    )
    .map((e) => ({
      assessment_id: e.assessmentId,
      enrollment_id: e.enrollmentId,
      score: e.score,
    }));

  const toDelete = entries.filter((e) => e.score === null);

  if (toUpsert.length > 0) {
    check(
      await supabase
        .from("scores")
        .upsert(toUpsert, { onConflict: "assessment_id,enrollment_id" }),
    );
  }

  for (const del of toDelete) {
    check(
      await supabase
        .from("scores")
        .delete()
        .eq("assessment_id", del.assessmentId)
        .eq("enrollment_id", del.enrollmentId),
    );
  }
}

export async function saveSubjectRemarks(
  termId: string,
  subjectId: string,
  entries: { enrollmentId: string; remark: string }[],
): Promise<void> {
  await Promise.all(
    entries.map((e) =>
      supabase
        .rpc("save_term_remark", {
          p_enrollment: e.enrollmentId,
          p_term: termId,
          p_subject: subjectId,
          p_remark: e.remark,
        })
        .then(check),
    ),
  );
}

export async function saveOverallRemark(
  enrollmentId: string,
  termId: string,
  remark: string,
): Promise<void> {
  check(
    await supabase.rpc("save_term_remark", {
      p_enrollment: enrollmentId,
      p_term: termId,
      p_subject: null,
      p_remark: remark,
    }),
  );
}

// ─── Class Broadsheet & Report Cards ─────────────────────────────────────────

const CORE_SUBJECT_NAMES = new Set([
  "english language",
  "mathematics",
  "integrated science",
  "social studies",
]);

export function scoreToBeceStanine(total: number): { grade: number; remark: string } {
  if (total >= 80) return { grade: 1, remark: "Highest" };
  if (total >= 70) return { grade: 2, remark: "Higher" };
  if (total >= 65) return { grade: 3, remark: "High" };
  if (total >= 60) return { grade: 4, remark: "High Average" };
  if (total >= 55) return { grade: 5, remark: "Average" };
  if (total >= 50) return { grade: 6, remark: "Low Average" };
  if (total >= 45) return { grade: 7, remark: "Low" };
  if (total >= 40) return { grade: 8, remark: "Lower" };
  return { grade: 9, remark: "Lowest" };
}

export function isCoreBeceSubject(subjectName: string): boolean {
  const lower = subjectName.trim().toLowerCase();
  if (CORE_SUBJECT_NAMES.has(lower)) return true;
  return (
    lower.includes("english") ||
    lower === "maths" ||
    lower.includes("mathematics") ||
    lower.includes("science") ||
    lower.includes("social studies")
  );
}

export function computeBestSixAggregate(
  subjects: BroadsheetStudentSubject[],
): number | null {
  const numericGrades = subjects
    .map((s) => {
      const parsed = s.grade ? Number.parseInt(s.grade, 10) : Number.NaN;
      const gradeNum =
        Number.isFinite(parsed) && parsed >= 1 && parsed <= 9
          ? parsed
          : s.total !== null
            ? scoreToBeceStanine(s.total).grade
            : Number.NaN;
      return {
        name: s.subjectName,
        isCore: isCoreBeceSubject(s.subjectName),
        gradeNum,
      };
    })
    .filter((g) => Number.isFinite(g.gradeNum) && g.gradeNum >= 1 && g.gradeNum <= 9);

  if (numericGrades.length === 0) return null;

  const cores = numericGrades
    .filter((g) => g.isCore)
    .sort((a, b) => a.gradeNum - b.gradeNum);
  const others = numericGrades
    .filter((g) => !g.isCore)
    .sort((a, b) => a.gradeNum - b.gradeNum);

  const chosen = [...cores.slice(0, 4), ...others].slice(0, 6);
  return chosen.reduce((sum, g) => sum + g.gradeNum, 0);
}

function _legacyBestSixUnused(
  subjects: BroadsheetStudentSubject[],
): number | null {
  const numericGrades = subjects
    .map((s) => ({
      name: s.subjectName.toLowerCase(),
      gradeNum: s.grade ? Number.parseInt(s.grade, 10) : Number.NaN,
    }))
    .filter((g) => Number.isFinite(g.gradeNum) && g.gradeNum >= 1 && g.gradeNum <= 9);

  if (numericGrades.length === 0) return null;

  const cores = numericGrades
    .filter((g) => CORE_SUBJECT_NAMES.has(g.name))
    .sort((a, b) => a.gradeNum - b.gradeNum);
  const others = numericGrades
    .filter((g) => !CORE_SUBJECT_NAMES.has(g.name))
    .sort((a, b) => a.gradeNum - b.gradeNum);

  const chosen = [...cores.slice(0, 4), ...others].slice(0, 6);
  return chosen.reduce((sum, g) => sum + g.gradeNum, 0);
}

export async function getClassBroadsheet(
  classId: string,
  termId: string,
): Promise<ClassBroadsheet> {
  const [config, classRow, termRow, classSubjects, enrollments] = await Promise.all([
    getClassGradingConfig(classId),
    supabase
      .from("classes")
      .select("id, section, staff(full_name), academic_years(name)")
      .eq("id", classId)
      .single()
      .then(check),
    supabase
      .from("terms")
      .select("id, name, start_date, end_date")
      .eq("id", termId)
      .single()
      .then(check),
    listClassSubjectsWithDetails(classId),
    supabase
      .from("enrollments")
      .select(
        "id, student_id, students!inner(id, admission_no, first_name, middle_name, last_name, photo_url, status, deleted_at)",
      )
      .eq("class_id", classId)
      .eq("status", "enrolled")
      .eq("students.status", "active")
      .is("students.deleted_at", null)
      .then(check),
  ]);

  const teacher = Array.isArray(classRow.staff) ? classRow.staff[0] : classRow.staff;
  const year = Array.isArray(classRow.academic_years)
    ? classRow.academic_years[0]
    : classRow.academic_years;

  const subjects = classSubjects.map((cs) => ({
    id: cs.subjectId,
    name: cs.subjectName,
  }));

  if (enrollments.length === 0) {
    return {
      classId,
      className: `${config.levelName} ${config.section}`,
      levelName: config.levelName,
      sitsBece: config.sitsBece,
      classTeacherName: teacher?.full_name ?? null,
      academicYearName: year?.name ?? "",
      termId: termRow.id,
      termName: termRow.name,
      termStartDate: termRow.start_date,
      termEndDate: termRow.end_date,
      gradingType: config.gradingType,
      scaleName: config.scaleName,
      bands: config.bands,
      subjects,
      students: [],
    };
  }

  const enrollmentIds = enrollments.map((e) => e.id);

  const [resultsRows, remarksRows, attendanceRows] = await Promise.all([
    supabase
      .from("term_results")
      .select("enrollment_id, subject_id, ca_total, exam_score, total, grade, remark")
      .eq("term_id", termId)
      .in("enrollment_id", enrollmentIds)
      .then(check),
    supabase
      .from("term_remarks")
      .select("enrollment_id, subject_id, remark")
      .eq("term_id", termId)
      .in("enrollment_id", enrollmentIds)
      .then(check),
    supabase
      .from("attendance")
      .select("enrollment_id, status")
      .gte("date", termRow.start_date)
      .lte("date", termRow.end_date)
      .in("enrollment_id", enrollmentIds)
      .then(check),
  ]);

  const resultMap = new Map<string, (typeof resultsRows)[number]>();
  for (const r of resultsRows) {
    resultMap.set(`${r.enrollment_id}:${r.subject_id}`, r);
  }

  const subjRemarkMap = new Map<string, string>();
  const overallRemarkMap = new Map<string, string>();
  for (const r of remarksRows) {
    if (r.subject_id === null) {
      overallRemarkMap.set(r.enrollment_id, r.remark);
    } else {
      subjRemarkMap.set(`${r.enrollment_id}:${r.subject_id}`, r.remark);
    }
  }

  const attendanceMap = new Map<
    string,
    { present: number; late: number; excused: number; absent: number; total: number }
  >();
  for (const a of attendanceRows) {
    const cur = attendanceMap.get(a.enrollment_id) ?? {
      present: 0,
      late: 0,
      excused: 0,
      absent: 0,
      total: 0,
    };
    cur.total += 1;
    if (a.status === "present") cur.present += 1;
    else if (a.status === "late") cur.late += 1;
    else if (a.status === "excused") cur.excused += 1;
    else if (a.status === "absent") cur.absent += 1;
    attendanceMap.set(a.enrollment_id, cur);
  }

  type StudentJoined = {
    id: string;
    admission_no: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    photo_url: string | null;
  };

  const isNumeric =
    config.gradingType === "ges_numeric" || config.gradingType === "custom_numeric";

  const students: BroadsheetStudent[] = enrollments
    .map((e) => {
      const s = (Array.isArray(e.students) ? e.students[0] : e.students) as StudentJoined;
      const fullName = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");

      const stuSubjects: BroadsheetStudentSubject[] = subjects.map((subj) => {
        const res = resultMap.get(`${e.id}:${subj.id}`);
        const desc = subjRemarkMap.get(`${e.id}:${subj.id}`) ?? null;
        return {
          subjectId: subj.id,
          subjectName: subj.name,
          caTotal: res ? Number(res.ca_total) : null,
          examScore: res ? Number(res.exam_score) : null,
          total: res ? Number(res.total) : null,
          grade: res?.grade ?? null,
          remark: res?.remark ?? null,
          descriptiveRemark: desc,
        };
      });

      const gradedSubjects = isNumeric
        ? stuSubjects.filter((sub) => sub.total !== null)
        : stuSubjects.filter((sub) => Boolean(sub.descriptiveRemark?.trim()));

      const sumTotals = stuSubjects.reduce(
        (acc, sub) => (sub.total !== null ? acc + sub.total : acc),
        0,
      );
      const numericCount = stuSubjects.filter((sub) => sub.total !== null).length;
      const averageScore =
        isNumeric && numericCount > 0
          ? Math.round((sumTotals / numericCount) * 10) / 10
          : null;

      return {
        enrollmentId: e.id,
        studentId: s.id,
        admissionNo: s.admission_no,
        fullName,
        lastName: s.last_name,
        firstName: s.first_name,
        photoPath: s.photo_url,
        subjectsGraded: gradedSubjects.length,
        totalSubjects: subjects.length,
        averageScore,
        rank: null as number | null,
        bestSixAggregate: isNumeric ? computeBestSixAggregate(stuSubjects) : null,
        overallRemark: overallRemarkMap.get(e.id) ?? "",
        attendance: attendanceMap.get(e.id) ?? {
          present: 0,
          late: 0,
          excused: 0,
          absent: 0,
          total: 0,
        },
        subjects: stuSubjects,
      };
    })
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName) ||
        a.admissionNo.localeCompare(b.admissionNo),
    )
    .map(({ lastName: _l, firstName: _f, ...rest }) => rest);

  // Compute class positions (ranks) for numeric scales with tie handling
  if (isNumeric) {
    const withAvg = [...students]
      .filter((s) => s.averageScore !== null)
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
    let currentRank = 1;
    for (let i = 0; i < withAvg.length; i++) {
      if (i > 0 && withAvg[i].averageScore !== withAvg[i - 1].averageScore) {
        currentRank = i + 1;
      }
      withAvg[i].rank = currentRank;
    }
  }

  return {
    classId,
    className: `${config.levelName} ${config.section}`,
    levelName: config.levelName,
    sitsBece: config.sitsBece,
    classTeacherName: teacher?.full_name ?? null,
    academicYearName: year?.name ?? "",
    termId: termRow.id,
    termName: termRow.name,
    termStartDate: termRow.start_date,
    termEndDate: termRow.end_date,
    gradingType: config.gradingType,
    scaleName: config.scaleName,
    bands: config.bands,
    subjects,
    students,
  };
}

// ─── Student / Parent Portal Grade Summary ───────────────────────────────────

export interface ViewableStudent {
  id: string;
  admissionNo: string;
  fullName: string;
  photoPath: string | null;
  enrollments: {
    enrollmentId: string;
    classId: string;
    className: string;
    academicYearId: string;
    academicYearName: string;
    isCurrentYear: boolean;
  }[];
}

export async function getMyViewableStudents(): Promise<ViewableStudent[]> {
  const rows = check(
    await supabase
      .from("students")
      .select(
        "id, admission_no, first_name, middle_name, last_name, photo_url, enrollments(id, class_id, academic_year_id, classes(section, levels(name)), academic_years(name, is_current, start_date))",
      )
      .is("deleted_at", null)
      .order("last_name"),
  );

  return rows.map((r) => {
    const rawEnrollments = Array.isArray(r.enrollments) ? r.enrollments : [];
    const enrollments = rawEnrollments
      .map((e) => {
        const cls = Array.isArray(e.classes) ? e.classes[0] : e.classes;
        const lvl = cls ? (Array.isArray(cls.levels) ? cls.levels[0] : cls.levels) : null;
        const yr = Array.isArray(e.academic_years)
          ? e.academic_years[0]
          : e.academic_years;
        return {
          enrollmentId: e.id,
          classId: e.class_id,
          className: [lvl?.name, cls?.section].filter(Boolean).join(" "),
          academicYearId: e.academic_year_id,
          academicYearName: yr?.name ?? "",
          isCurrentYear: Boolean(yr?.is_current),
          startDate: yr?.start_date ?? "",
        };
      })
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
      .map(({ startDate: _s, ...rest }) => rest);

    return {
      id: r.id,
      admissionNo: r.admission_no,
      fullName: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(" "),
      photoPath: r.photo_url,
      enrollments,
    };
  });
}

export interface StudentTermOverview {
  termId: string;
  termName: string;
  yearName: string;
  classId: string;
  className: string;
  gradingType: GradingType;
  overallRemark: string | null;
  results: {
    subjectId: string;
    subjectName: string;
    caTotal: number;
    examScore: number;
    total: number;
    grade: string | null;
    remark: string | null;
  }[];
  descriptiveRemarks: {
    subjectId: string;
    subjectName: string;
    remark: string;
  }[];
}

export async function getStudentGradesOverview(
  studentId: string,
): Promise<StudentTermOverview[]> {
  const enrollments = check(
    await supabase
      .from("enrollments")
      .select(
        "id, class_id, academic_year_id, classes(section, levels(name, grading_scales(type))), academic_years(name)",
      )
      .eq("student_id", studentId),
  );

  if (enrollments.length === 0) return [];

  const enrollmentIds = enrollments.map((e) => e.id);
  const yearIds = Array.from(new Set(enrollments.map((e) => e.academic_year_id)));

  const [terms, results, remarks] = await Promise.all([
    supabase
      .from("terms")
      .select("id, academic_year_id, name, start_date")
      .in("academic_year_id", yearIds)
      .order("start_date", { ascending: false })
      .then(check),
    supabase
      .from("term_results")
      .select("enrollment_id, term_id, subject_id, ca_total, exam_score, total, grade, remark, subjects(name)")
      .in("enrollment_id", enrollmentIds)
      .then(check),
    supabase
      .from("term_remarks")
      .select("enrollment_id, term_id, subject_id, remark, subjects(name)")
      .in("enrollment_id", enrollmentIds)
      .then(check),
  ]);

  const enrolByYear = new Map(enrollments.map((e) => [e.academic_year_id, e]));

  const out: StudentTermOverview[] = [];
  for (const t of terms) {
    const enrol = enrolByYear.get(t.academic_year_id);
    if (!enrol) continue;

    const termRes = results
      .filter((r) => r.enrollment_id === enrol.id && r.term_id === t.id)
      .map((r) => {
        const subj = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
        return {
          subjectId: r.subject_id,
          subjectName: subj?.name ?? "Subject",
          caTotal: Number(r.ca_total),
          examScore: Number(r.exam_score),
          total: Number(r.total),
          grade: r.grade,
          remark: r.remark,
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    const termRem = remarks.filter(
      (r) => r.enrollment_id === enrol.id && r.term_id === t.id,
    );
    const overall = termRem.find((r) => r.subject_id === null)?.remark ?? null;
    const descRemarks = termRem
      .filter((r) => r.subject_id !== null)
      .map((r) => {
        const subj = Array.isArray(r.subjects) ? r.subjects[0] : r.subjects;
        return {
          subjectId: r.subject_id!,
          subjectName: subj?.name ?? "Subject",
          remark: r.remark,
        };
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    if (termRes.length === 0 && descRemarks.length === 0 && !overall) continue;

    const cls = Array.isArray(enrol.classes) ? enrol.classes[0] : enrol.classes;
    const lvl = cls ? (Array.isArray(cls.levels) ? cls.levels[0] : cls.levels) : null;
    const gs = lvl
      ? Array.isArray(lvl.grading_scales)
        ? lvl.grading_scales[0]
        : lvl.grading_scales
      : null;
    const yr = Array.isArray(enrol.academic_years)
      ? enrol.academic_years[0]
      : enrol.academic_years;

    out.push({
      termId: t.id,
      termName: t.name,
      yearName: yr?.name ?? "",
      classId: enrol.class_id,
      className: [lvl?.name, cls?.section].filter(Boolean).join(" "),
      gradingType: (gs?.type as GradingType | undefined) ?? "ges_numeric",
      overallRemark: overall,
      results: termRes,
      descriptiveRemarks: descRemarks,
    });
  }

  return out;
}

// ─── BECE Candidate Registration & Mock Exam Analytics ───────────────────────

export type BeceRegistrationStatus = "pending" | "registered" | "withdrawn";

export interface BeceRegistrationRow {
  id: string;
  studentId: string;
  examYear: number;
  indexNumber: string | null;
  centreNumber: string | null;
  registrationStatus: BeceRegistrationStatus;
  officialAggregate: number | null;
  enteredOn: string | null;
}

export async function listBeceRegistrations(
  examYear: number,
): Promise<BeceRegistrationRow[]> {
  const rows = check(
    await supabase
      .from("bece_registrations")
      .select(
        "id, student_id, exam_year, index_number, centre_number, registration_status, official_aggregate, entered_on",
      )
      .eq("exam_year", examYear),
  );

  return rows.map((r) => ({
    id: r.id,
    studentId: r.student_id,
    examYear: Number(r.exam_year),
    indexNumber: r.index_number ?? null,
    centreNumber: r.centre_number ?? null,
    registrationStatus:
      (r.registration_status as BeceRegistrationStatus | null) ?? "registered",
    officialAggregate:
      r.official_aggregate !== null && r.official_aggregate !== undefined
        ? Number(r.official_aggregate)
        : null,
    enteredOn: r.entered_on ?? null,
  }));
}

export async function upsertBeceRegistration(input: {
  studentId: string;
  examYear: number;
  indexNumber: string | null;
  centreNumber?: string | null;
  registrationStatus?: BeceRegistrationStatus;
  officialAggregate?: number | null;
}): Promise<void> {
  const cleanIdx = input.indexNumber?.trim() || null;
  const cleanCentre = input.centreNumber?.trim() || null;
  check(
    await supabase.from("bece_registrations").upsert(
      {
        student_id: input.studentId,
        exam_year: input.examYear,
        index_number: cleanIdx,
        centre_number: cleanCentre,
        registration_status: input.registrationStatus ?? "registered",
        official_aggregate: input.officialAggregate ?? null,
      },
      { onConflict: "student_id,exam_year" },
    ),
  );
}

export async function bulkAssignBeceIndexNumbers(input: {
  examYear: number;
  centreNumber: string;
  studentIdsInOrder: string[];
  startingSerial?: number;
}): Promise<number> {
  const centre = input.centreNumber.trim().replace(/\s+/g, "");
  if (!centre) throw new Error("Enter a WAEC school/centre code first.");
  const start = Math.max(1, input.startingSerial ?? 1);
  const rows = input.studentIdsInOrder.map((studentId, idx) => {
    const serial = String(start + idx).padStart(3, "0");
    return {
      student_id: studentId,
      exam_year: input.examYear,
      centre_number: centre,
      index_number: `${centre}${serial}`,
      registration_status: "registered" as const,
    };
  });
  if (rows.length === 0) return 0;
  check(
    await supabase
      .from("bece_registrations")
      .upsert(rows, { onConflict: "student_id,exam_year" }),
  );
  return rows.length;
}


// ─── Behavioral Traits, Remarks & Report Publication ─────────────────────────

export type PromotionalStatus =
  | "promoted"
  | "promoted_on_trial"
  | "repeated"
  | "withdrawn"
  | "pending";

export interface StudentBehavioralAssessment {
  id: string;
  enrollmentId: string;
  termId: string;
  punctuality: number | null;
  neatness: number | null;
  politeness: number | null;
  attitudeToWork: number | null;
  leadership: number | null;
  teacherRemarks: string | null;
  headteacherRemarks: string | null;
  promotionalStatus: PromotionalStatus;
  updatedAt: string;
}

export interface TermReportPublication {
  id: string;
  classId: string;
  termId: string;
  isPublished: boolean;
  publishedAt: string | null;
  publishedBy: string | null;
  reopeningDate: string | null;
  vacationDate: string | null;
  nextTermFees: number | null;
  updatedAt: string;
}

export interface ClassAssessmentProgress {
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  assessmentCount: number;
  enrolledStudents: number;
  gradedStudents: number;
  completionPct: number;
}

export async function getStudentBehavioralAssessment(
  enrollmentId: string,
  termId: string,
): Promise<StudentBehavioralAssessment | null> {
  const row = check(
    await supabase
      .from("student_behavioral_assessments")
      .select("*")
      .eq("enrollment_id", enrollmentId)
      .eq("term_id", termId)
      .maybeSingle(),
  );

  if (!row) return null;

  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    termId: row.term_id,
    punctuality: row.punctuality ?? null,
    neatness: row.neatness ?? null,
    politeness: row.politeness ?? null,
    attitudeToWork: row.attitude_to_work ?? null,
    leadership: row.leadership ?? null,
    teacherRemarks: row.teacher_remarks ?? null,
    headteacherRemarks: row.headteacher_remarks ?? null,
    promotionalStatus: (row.promotional_status ?? "pending") as PromotionalStatus,
    updatedAt: row.updated_at,
  };
}

export async function listClassBehavioralAssessments(
  classId: string,
  termId: string,
): Promise<Record<string, StudentBehavioralAssessment>> {
  const enrollments = check(
    await supabase
      .from("enrollments")
      .select("id")
      .eq("class_id", classId)
      .eq("status", "enrolled"),
  );

  if (enrollments.length === 0) return {};

  const enrollmentIds = enrollments.map((e) => e.id);
  const rows = check(
    await supabase
      .from("student_behavioral_assessments")
      .select("*")
      .in("enrollment_id", enrollmentIds)
      .eq("term_id", termId),
  );

  const res: Record<string, StudentBehavioralAssessment> = {};
  for (const r of rows) {
    res[r.enrollment_id] = {
      id: r.id,
      enrollmentId: r.enrollment_id,
      termId: r.term_id,
      punctuality: r.punctuality ?? null,
      neatness: r.neatness ?? null,
      politeness: r.politeness ?? null,
      attitudeToWork: r.attitude_to_work ?? null,
      leadership: r.leadership ?? null,
      teacherRemarks: r.teacher_remarks ?? null,
      headteacherRemarks: r.headteacher_remarks ?? null,
      promotionalStatus: (r.promotional_status ?? "pending") as PromotionalStatus,
      updatedAt: r.updated_at,
    };
  }
  return res;
}

export async function saveStudentBehavioralAssessment(input: {
  enrollmentId: string;
  termId: string;
  punctuality?: number | null;
  neatness?: number | null;
  politeness?: number | null;
  attitudeToWork?: number | null;
  leadership?: number | null;
  teacherRemarks?: string | null;
  headteacherRemarks?: string | null;
  promotionalStatus?: PromotionalStatus;
}): Promise<StudentBehavioralAssessment> {
  const row = check(
    await supabase.rpc("save_behavioral_assessment", {
      p_enrollment: input.enrollmentId,
      p_term: input.termId,
      p_punctuality: input.punctuality ?? null,
      p_neatness: input.neatness ?? null,
      p_politeness: input.politeness ?? null,
      p_attitude: input.attitudeToWork ?? null,
      p_leadership: input.leadership ?? null,
      p_teacher_remarks: input.teacherRemarks ?? null,
      p_headteacher_remarks: input.headteacherRemarks ?? null,
      p_promotional_status: input.promotionalStatus ?? "pending",
    }),
  );

  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    termId: row.term_id,
    punctuality: row.punctuality ?? null,
    neatness: row.neatness ?? null,
    politeness: row.politeness ?? null,
    attitudeToWork: row.attitude_to_work ?? null,
    leadership: row.leadership ?? null,
    teacherRemarks: row.teacher_remarks ?? null,
    headteacherRemarks: row.headteacher_remarks ?? null,
    promotionalStatus: (row.promotional_status ?? "pending") as PromotionalStatus,
    updatedAt: row.updated_at,
  };
}

export async function getTermReportPublication(
  classId: string,
  termId: string,
): Promise<TermReportPublication | null> {
  const row = check(
    await supabase
      .from("term_report_publications")
      .select("*")
      .eq("class_id", classId)
      .eq("term_id", termId)
      .maybeSingle(),
  );

  if (!row) return null;

  return {
    id: row.id,
    classId: row.class_id,
    termId: row.term_id,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    reopeningDate: row.reopening_date,
    vacationDate: row.vacation_date,
    nextTermFees: row.next_term_fees !== null ? Number(row.next_term_fees) : null,
    updatedAt: row.updated_at,
  };
}

export async function setTermReportPublication(input: {
  classId: string;
  termId: string;
  isPublished: boolean;
  reopeningDate?: string | null;
  vacationDate?: string | null;
  nextTermFees?: number | null;
}): Promise<TermReportPublication> {
  const row = check(
    await supabase.rpc("set_term_report_publication", {
      p_class: input.classId,
      p_term: input.termId,
      p_is_published: input.isPublished,
      p_reopening_date: input.reopeningDate ?? null,
      p_vacation_date: input.vacationDate ?? null,
      p_next_term_fees: input.nextTermFees ?? null,
    }),
  );

  return {
    id: row.id,
    classId: row.class_id,
    termId: row.term_id,
    isPublished: row.is_published,
    publishedAt: row.published_at,
    publishedBy: row.published_by,
    reopeningDate: row.reopening_date,
    vacationDate: row.vacation_date,
    nextTermFees: row.next_term_fees !== null ? Number(row.next_term_fees) : null,
    updatedAt: row.updated_at,
  };
}

export async function getClassAssessmentProgress(
  classId: string,
  termId: string,
): Promise<ClassAssessmentProgress[]> {
  const rows = check(
    await supabase.rpc("get_class_assessment_progress", {
      p_class: classId,
      p_term: termId,
    }),
  );

  return rows.map((r: {
    class_subject_id: string;
    subject_id: string;
    subject_name: string;
    teacher_name: string | null;
    assessment_count: number | string;
    enrolled_students: number | string;
    graded_students: number | string;
    completion_pct: number | string;
  }) => ({
    classSubjectId: r.class_subject_id,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    teacherName: r.teacher_name,
    assessmentCount: Number(r.assessment_count),
    enrolledStudents: Number(r.enrolled_students),
    gradedStudents: Number(r.graded_students),
    completionPct: Number(r.completion_pct),
  }));
}
