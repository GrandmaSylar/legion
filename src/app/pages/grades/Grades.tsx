import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Award,
  BookOpen,
  Check,
  FileSpreadsheet,
  FileText,
  Plus,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import { listAcademicYears, listClasses, listTerms } from "../../../lib/data/setup";
import {
  ASSESSMENT_TYPES,
  CHECKLIST_PRESETS,
  createAssessment,
  createStandardGesAssessments,
  deleteAssessment,
  getClassBroadsheet,
  getClassGradingConfig,
  getMyTeachingAssignments,
  getMyViewableStudents,
  getSubjectGradebook,
  listClassSubjectsWithDetails,
  saveOverallRemark,
  saveSubjectRemarks,
  saveSubjectScores,
  type Assessment,
  type AssessmentType,
  type GradeBand,
  type GradebookStudentRow,
} from "../../../lib/data/grades";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { StudentAvatar, usePhotoUrls } from "../../components/StudentAvatar";
import { ReportCardView } from "./ReportCardView";

function matchBand(total: number, bands: GradeBand[]): { grade: string; remark: string } | null {
  for (const b of bands) {
    if (total >= b.minScore && total <= b.maxScore) {
      return { grade: b.grade, remark: b.remark };
    }
  }
  return null;
}

function computeLiveRowResult(
  assessments: Assessment[],
  scores: Record<string, string>,
  bands: GradeBand[],
): {
  hasAny: boolean;
  ca: number;
  exam: number;
  total: number;
  grade: string | null;
  remark: string | null;
} {
  let ca = 0;
  let exam = 0;
  let hasAny = false;

  for (const a of assessments) {
    const raw = scores[a.id];
    if (raw === undefined || raw.trim() === "") continue;
    const num = Number(raw);
    if (Number.isNaN(num)) continue;
    hasAny = true;
    const weighted = (num / a.maxScore) * a.weight;
    if (a.type === "exam") exam += weighted;
    else ca += weighted;
  }

  const total = Math.round((ca + exam) * 100) / 100;
  const band = hasAny ? matchBand(total, bands) : null;
  return {
    hasAny,
    ca: Math.round(ca * 100) / 100,
    exam: Math.round(exam * 100) / 100,
    total,
    grade: band?.grade ?? null,
    remark: band?.remark ?? null,
  };
}

// ─── Parent / Student Portal View ────────────────────────────────────────────

function PortalGradesView() {
  const { profile } = useAuth();
  const studentsQuery = useQuery({
    queryKey: ["my-viewable-students"],
    queryFn: getMyViewableStudents,
  });
  const termsQuery = useQuery({ queryKey: ["terms"], queryFn: listTerms });

  const students = studentsQuery.data ?? [];
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const activeStudent =
    students.find((s) => s.id === selectedStudentId) ?? students[0] ?? null;

  const activeEnrollment = activeStudent?.enrollments[0] ?? null;

  const yearTerms = useMemo(() => {
    if (!activeEnrollment || !termsQuery.data) return [];
    return termsQuery.data.filter(
      (t) => t.academicYearId === activeEnrollment.academicYearId,
    );
  }, [activeEnrollment, termsQuery.data]);

  const [selectedTermId, setSelectedTermId] = useState("");
  const activeTerm =
    yearTerms.find((t) => t.id === selectedTermId) ??
    yearTerms.find((t) => t.isCurrent) ??
    yearTerms[0] ??
    null;

  const broadsheetQuery = useQuery({
    queryKey: ["broadsheet", activeEnrollment?.classId, activeTerm?.id],
    queryFn: () =>
      getClassBroadsheet(activeEnrollment!.classId, activeTerm!.id),
    enabled: !!activeEnrollment?.classId && !!activeTerm?.id,
  });

  const photoUrls = usePhotoUrls(
    activeStudent?.photoPath ? [activeStudent.id] : [],
  );

  if (studentsQuery.isLoading || termsQuery.isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (students.length === 0) {
    return (
      <section className="surface p-6 text-sm text-muted-foreground">
        No linked student record was found for your account.
      </section>
    );
  }

  const studentInBroadsheet =
    broadsheetQuery.data?.students.find((s) => s.studentId === activeStudent?.id) ??
    null;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Academic report card
        </h1>
        <p className="text-sm text-muted-foreground">
          View and print terminal results and teacher remarks.
        </p>
      </div>

      <section className="surface grid gap-3 p-4 sm:grid-cols-2 print:hidden">
        {students.length > 1 ? (
          <Field label="Student" htmlFor="portal-student">
            <NativeSelect
              id="portal-student"
              value={activeStudent?.id ?? ""}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName} ({s.admissionNo})
                </option>
              ))}
            </NativeSelect>
          </Field>
        ) : null}

        <Field label="Term" htmlFor="portal-term">
          <NativeSelect
            id="portal-term"
            value={activeTerm?.id ?? ""}
            onChange={(e) => setSelectedTermId(e.target.value)}
          >
            {yearTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({activeEnrollment?.academicYearName})
              </option>
            ))}
          </NativeSelect>
        </Field>
      </section>

      {broadsheetQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : broadsheetQuery.data && studentInBroadsheet ? (
        <ReportCardView
          schoolName={profile?.schoolName ?? ""}
          broadsheet={broadsheetQuery.data}
          students={[studentInBroadsheet]}
          photoUrls={photoUrls}
          canEditRemark={false}
        />
      ) : (
        <section className="surface p-6 text-sm text-muted-foreground">
          No report card is available for the selected term yet.
        </section>
      )}
    </div>
  );
}

// ─── Staff Subject Gradebook View ────────────────────────────────────────────

function SubjectGradebookSection({
  classId,
  classSubjectId,
  subjectId,
  subjectName,
  termId,
  canEdit,
}: {
  classId: string;
  classSubjectId: string;
  subjectId: string;
  subjectName: string;
  termId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAddAssessment, setShowAddAssessment] = useState(false);
  const [newType, setNewType] = useState<AssessmentType>("class_exercise");
  const [newTitle, setNewTitle] = useState("");
  const [newMaxScore, setNewMaxScore] = useState("20");
  const [newWeight, setNewWeight] = useState("10");
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const configQuery = useQuery({
    queryKey: ["class-grading-config", classId],
    queryFn: () => getClassGradingConfig(classId),
  });

  const gradebookQuery = useQuery({
    queryKey: ["subject-gradebook", classId, classSubjectId, subjectId, termId],
    queryFn: () => getSubjectGradebook(classId, classSubjectId, subjectId, termId),
  });

  const [scoreEdits, setScoreEdits] = useState<
    Record<string, Record<string, string>>
  >({});
  const [remarkEdits, setRemarkEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    setSavedBanner(null);
    if (!gradebookQuery.data) return;
    const nextScores: Record<string, Record<string, string>> = {};
    const nextRemarks: Record<string, string> = {};
    for (const s of gradebookQuery.data.students) {
      const rowMap: Record<string, string> = {};
      for (const a of gradebookQuery.data.assessments) {
        const val = s.scores[a.id];
        rowMap[a.id] = val !== null && val !== undefined ? String(val) : "";
      }
      nextScores[s.enrollmentId] = rowMap;
      nextRemarks[s.enrollmentId] = s.descriptiveRemark ?? "";
    }
    setScoreEdits(nextScores);
    setRemarkEdits(nextRemarks);
  }, [gradebookQuery.data]);

  const invalidateGradebook = () => {
    void qc.invalidateQueries({
      queryKey: ["subject-gradebook", classId, classSubjectId, subjectId, termId],
    });
    void qc.invalidateQueries({ queryKey: ["broadsheet", classId, termId] });
  };

  const addAssessmentMutation = useMutation({
    mutationFn: () =>
      createAssessment({
        classSubjectId,
        termId,
        type: newType,
        title: newTitle,
        maxScore: Number(newMaxScore),
        weight: Number(newWeight),
      }),
    onSuccess: () => {
      setNewTitle("");
      setShowAddAssessment(false);
      invalidateGradebook();
    },
  });

  const createPresetMutation = useMutation({
    mutationFn: () => createStandardGesAssessments(classSubjectId, termId),
    onSuccess: invalidateGradebook,
  });

  const removeAssessmentMutation = useMutation({
    mutationFn: (id: string) => deleteAssessment(id),
    onSuccess: invalidateGradebook,
  });

  const assessments = gradebookQuery.data?.assessments ?? [];
  const students = gradebookQuery.data?.students ?? [];
  const config = configQuery.data;
  const isNumeric =
    !config ||
    config.gradingType === "ges_numeric" ||
    config.gradingType === "custom_numeric";

  const photoIds = useMemo(
    () => students.map((s) => (s.photoPath ? s.studentId : null)),
    [students],
  );
  const photoUrls = usePhotoUrls(photoIds);

  // Compute dirty state for numeric scores or descriptive remarks
  const dirtyScores = useMemo(() => {
    const out: {
      assessmentId: string;
      enrollmentId: string;
      score: number | null;
      invalid: boolean;
    }[] = [];
    for (const s of students) {
      const edits = scoreEdits[s.enrollmentId] ?? {};
      for (const a of assessments) {
        const raw = (edits[a.id] ?? "").trim();
        const orig = s.scores[a.id];
        if (raw === "") {
          if (orig !== null && orig !== undefined) {
            out.push({
              assessmentId: a.id,
              enrollmentId: s.enrollmentId,
              score: null,
              invalid: false,
            });
          }
        } else {
          const num = Number(raw);
          const invalid = Number.isNaN(num) || num < 0 || num > a.maxScore;
          if (invalid || orig === null || orig === undefined || num !== orig) {
            out.push({
              assessmentId: a.id,
              enrollmentId: s.enrollmentId,
              score: num,
              invalid,
            });
          }
        }
      }
    }
    return out;
  }, [students, assessments, scoreEdits]);

  const dirtyRemarks = useMemo(() => {
    const out: { enrollmentId: string; remark: string }[] = [];
    for (const s of students) {
      const edited = (remarkEdits[s.enrollmentId] ?? "").trim();
      const orig = (s.descriptiveRemark ?? "").trim();
      if (edited !== orig) {
        out.push({ enrollmentId: s.enrollmentId, remark: edited });
      }
    }
    return out;
  }, [students, remarkEdits]);

  const hasInvalidScore = dirtyScores.some((d) => d.invalid);
  const dirtyCount = isNumeric ? dirtyScores.length : dirtyRemarks.length;

  const saveScoresMutation = useMutation({
    mutationFn: () =>
      saveSubjectScores(
        dirtyScores.map(({ assessmentId, enrollmentId, score }) => ({
          assessmentId,
          enrollmentId,
          score,
        })),
      ),
    onSuccess: () => {
      setSavedBanner(`Scores saved for ${subjectName}.`);
      invalidateGradebook();
    },
  });

  const saveRemarksMutation = useMutation({
    mutationFn: () => saveSubjectRemarks(termId, subjectId, dirtyRemarks),
    onSuccess: () => {
      setSavedBanner(`Remarks saved for ${subjectName}.`);
      invalidateGradebook();
    },
  });

  const weightsSummary = useMemo(() => {
    let caWeight = 0;
    let examWeight = 0;
    for (const a of assessments) {
      if (a.type === "exam") examWeight += a.weight;
      else caWeight += a.weight;
    }
    return { caWeight, examWeight, totalWeight: caWeight + examWeight };
  }, [assessments]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.admissionNo.toLowerCase().includes(q),
    );
  }, [students, search]);

  const submitNewAssessment = (e: FormEvent) => {
    e.preventDefault();
    addAssessmentMutation.mutate();
  };

  if (configQuery.isLoading || gradebookQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      {/* Assessments & Scale Header */}
      <section className="surface space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{subjectName}</h2>
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
                {config?.scaleName ?? "GES Basic (1-7)"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {isNumeric
                ? `Continuous Assessment (CA): ${weightsSummary.caWeight}% (target 30%) · Exam: ${weightsSummary.examWeight}% (target 70%) · Total weight: ${weightsSummary.totalWeight}%`
                : "Enter observations or milestone remarks for each pupil in this subject."}
            </p>
          </div>

          {isNumeric && canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              {assessments.length === 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={createPresetMutation.isPending}
                  onClick={() => createPresetMutation.mutate()}
                >
                  <Sparkles className="size-3.5" aria-hidden />
                  {createPresetMutation.isPending
                    ? "Creating..."
                    : "Use standard GES assessments (CA 30 + Exam 70)"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddAssessment((v) => !v)}
              >
                <Plus className="size-3.5" aria-hidden />
                Add assessment
              </Button>
            </div>
          ) : null}
        </div>

        {/* Assessment pills (Numeric) */}
        {isNumeric && assessments.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {assessments.map((a) => (
              <div
                key={a.id}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background/60 px-3 py-1.5 text-xs"
              >
                <span className="font-medium">{a.title}</span>
                <span className="tabular-nums text-muted-foreground">
                  Max {a.maxScore} · Weight {a.weight}%
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    aria-label={`Delete assessment ${a.title}`}
                    disabled={removeAssessmentMutation.isPending}
                    onClick={() => removeAssessmentMutation.mutate(a.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {/* New Assessment Form */}
        {isNumeric && showAddAssessment && canEdit ? (
          <form
            onSubmit={submitNewAssessment}
            className="grid gap-3 rounded-2xl border border-border bg-background/50 p-3 sm:grid-cols-5 sm:items-end"
          >
            <Field label="Type" htmlFor="ass-type">
              <NativeSelect
                id="ass-type"
                value={newType}
                onChange={(e) => {
                  const t = e.target.value as AssessmentType;
                  setNewType(t);
                  if (t === "exam") {
                    setNewMaxScore("100");
                    setNewWeight("70");
                  }
                }}
              >
                {ASSESSMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Title (optional)" htmlFor="ass-title">
              <Input
                id="ass-title"
                placeholder="e.g. Test 1"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
              />
            </Field>
            <Field label="Max score" htmlFor="ass-max">
              <Input
                id="ass-max"
                type="number"
                min="1"
                max="1000"
                step="any"
                value={newMaxScore}
                onChange={(e) => setNewMaxScore(e.target.value)}
              />
            </Field>
            <Field label="Weight (%)" htmlFor="ass-weight">
              <Input
                id="ass-weight"
                type="number"
                min="1"
                max="100"
                step="any"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                disabled={
                  addAssessmentMutation.isPending ||
                  !(Number(newMaxScore) > 0) ||
                  !(Number(newWeight) > 0 && Number(newWeight) <= 100)
                }
              >
                Add
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowAddAssessment(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        <FormMessage
          error={
            addAssessmentMutation.isError ||
            createPresetMutation.isError ||
            removeAssessmentMutation.isError
              ? friendlyError(
                  addAssessmentMutation.error ??
                    createPresetMutation.error ??
                    removeAssessmentMutation.error,
                )
              : null
          }
        />
      </section>

      <FormMessage
        error={
          saveScoresMutation.isError || saveRemarksMutation.isError
            ? friendlyError(saveScoresMutation.error ?? saveRemarksMutation.error)
            : hasInvalidScore
              ? "One or more entered scores exceed the maximum score for that assessment."
              : null
        }
        ok={savedBanner}
      />

      {/* Marks / Remarks Table */}
      <section className="surface space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-48 flex-1 sm:w-64 sm:flex-initial">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Search pupil..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {canEdit && students.length > 0 ? (
            <div className="flex items-center gap-2">
              {dirtyCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void gradebookQuery.refetch()}
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                disabled={
                  dirtyCount === 0 ||
                  hasInvalidScore ||
                  saveScoresMutation.isPending ||
                  saveRemarksMutation.isPending
                }
                onClick={() =>
                  isNumeric
                    ? saveScoresMutation.mutate()
                    : saveRemarksMutation.mutate()
                }
              >
                <Check className="size-4" aria-hidden />
                {saveScoresMutation.isPending || saveRemarksMutation.isPending
                  ? "Saving..."
                  : dirtyCount > 0
                    ? `Save (${dirtyCount})`
                    : "Saved"}
              </Button>
            </div>
          ) : null}
        </div>

        {students.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No active pupils are enrolled in this class.
          </div>
        ) : isNumeric && assessments.length === 0 ? (
          <div className="py-10 text-center">
            <FileSpreadsheet
              className="mx-auto size-8 text-muted-foreground/60"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium">
              No assessments set up for {subjectName} in this term yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {canEdit
                ? "Click 'Use standard GES assessments (CA 30 + Exam 70)' above or add custom assessments to start entering marks."
                : "The subject teacher has not created assessments for this term yet."}
            </p>
          </div>
        ) : isNumeric ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Pupil</th>
                  {assessments.map((a) => (
                    <th key={a.id} className="py-2 px-2 font-medium">
                      <div className="truncate max-w-28" title={a.title}>
                        {a.title}
                      </div>
                      <div className="text-[10px] font-normal tabular-nums text-muted-foreground">
                        /{a.maxScore} ({a.weight}%)
                      </div>
                    </th>
                  ))}
                  <th className="py-2 px-2 text-right font-medium">CA (30)</th>
                  <th className="py-2 px-2 text-right font-medium">Exam (70)</th>
                  <th className="py-2 px-2 text-right font-medium">Total</th>
                  <th className="py-2 px-2 text-center font-medium">Grade</th>
                  <th className="py-2 pl-2 font-medium">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.map((s: GradebookStudentRow) => {
                  const rowEdits = scoreEdits[s.enrollmentId] ?? {};
                  const live = computeLiveRowResult(
                    assessments,
                    rowEdits,
                    config?.bands ?? [],
                  );
                  return (
                    <tr key={s.enrollmentId}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2.5">
                          <StudentAvatar
                            name={s.fullName}
                            url={s.photoPath ? photoUrls[s.studentId] : null}
                            className="size-8 shrink-0 text-xs"
                          />
                          <div className="min-w-0">
                            <Link
                              to={`/students/${s.studentId}`}
                              className="block truncate font-medium hover:text-primary hover:underline"
                            >
                              {s.fullName}
                            </Link>
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {s.admissionNo}
                            </span>
                          </div>
                        </div>
                      </td>

                      {assessments.map((a) => {
                        const val = rowEdits[a.id] ?? "";
                        const num = val.trim() === "" ? null : Number(val);
                        const invalid =
                          num !== null &&
                          (Number.isNaN(num) || num < 0 || num > a.maxScore);
                        return (
                          <td key={a.id} className="py-2 px-2">
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              min="0"
                              max={a.maxScore}
                              disabled={!canEdit}
                              aria-label={`${a.title} score for ${s.fullName}`}
                              value={val}
                              placeholder="—"
                              onChange={(e) => {
                                setSavedBanner(null);
                                setScoreEdits((prev) => ({
                                  ...prev,
                                  [s.enrollmentId]: {
                                    ...(prev[s.enrollmentId] ?? {}),
                                    [a.id]: e.target.value,
                                  },
                                }));
                              }}
                              className={cn(
                                "h-8 w-20 tabular-nums",
                                invalid &&
                                  "border-destructive focus-visible:ring-destructive",
                              )}
                            />
                          </td>
                        );
                      })}

                      <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                        {live.hasAny ? live.ca.toFixed(1) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                        {live.hasAny ? live.exam.toFixed(1) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        {live.hasAny ? live.total.toFixed(1) : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        {live.grade ? (
                          <span className="inline-flex min-w-6 items-center justify-center rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-bold tabular-nums text-primary">
                            {live.grade}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 pl-2 text-xs text-muted-foreground">
                        {live.remark ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Descriptive / Checklist mode */
          <ul className="divide-y divide-border">
            {filteredStudents.map((s) => {
              const val = remarkEdits[s.enrollmentId] ?? "";
              return (
                <li key={s.enrollmentId} className="space-y-2 py-3">
                  <div className="flex items-center gap-3">
                    <StudentAvatar
                      name={s.fullName}
                      url={s.photoPath ? photoUrls[s.studentId] : null}
                      className="size-9 shrink-0 text-xs"
                    />
                    <div>
                      <div className="text-sm font-medium">{s.fullName}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {s.admissionNo}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5 pl-12">
                    <Input
                      disabled={!canEdit}
                      placeholder="Write teacher's observation / progress remark..."
                      value={val}
                      onChange={(e) => {
                        setSavedBanner(null);
                        setRemarkEdits((prev) => ({
                          ...prev,
                          [s.enrollmentId]: e.target.value,
                        }));
                      }}
                    />
                    {canEdit && config?.gradingType === "checklist" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {CHECKLIST_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() =>
                              setRemarkEdits((prev) => ({
                                ...prev,
                                [s.enrollmentId]: preset,
                              }))
                            }
                            className="rounded-lg border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-foreground"
                          >
                            {preset.split(" — ")[0]}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Staff Broadsheet & Report Cards View ────────────────────────────────────

function BroadsheetSection({
  classId,
  termId,
  canEditRemark,
  initialStudentId,
}: {
  classId: string;
  termId: string;
  canEditRemark: boolean;
  initialStudentId?: string;
}) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    initialStudentId || null,
  );
  const [printAllMode, setPrintAllMode] = useState(false);
  const [remarkDrafts, setRemarkDrafts] = useState<Record<string, string>>({});

  const broadsheetQuery = useQuery({
    queryKey: ["broadsheet", classId, termId],
    queryFn: () => getClassBroadsheet(classId, termId),
  });

  useEffect(() => {
    if (!broadsheetQuery.data) return;
    const map: Record<string, string> = {};
    for (const s of broadsheetQuery.data.students) {
      map[s.enrollmentId] = s.overallRemark;
    }
    setRemarkDrafts(map);
  }, [broadsheetQuery.data]);

  const students = broadsheetQuery.data?.students ?? [];
  const photoIds = useMemo(
    () => students.map((s) => (s.photoPath ? s.studentId : null)),
    [students],
  );
  const photoUrls = usePhotoUrls(photoIds);

  const saveRemarkMutation = useMutation({
    mutationFn: ({
      enrollmentId,
      remark,
    }: {
      enrollmentId: string;
      remark: string;
    }) => saveOverallRemark(enrollmentId, termId, remark),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["broadsheet", classId, termId] });
    },
  });

  if (broadsheetQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (broadsheetQuery.isError || !broadsheetQuery.data) {
    return (
      <div
        role="alert"
        className="surface flex items-center gap-2 p-4 text-sm text-destructive"
      >
        <AlertCircle className="size-4 shrink-0" aria-hidden />
        <span>Could not load the class broadsheet.</span>
      </div>
    );
  }

  const broadsheet = broadsheetQuery.data;
  const isNumeric =
    broadsheet.gradingType === "ges_numeric" ||
    broadsheet.gradingType === "custom_numeric";

  if (printAllMode) {
    return (
      <ReportCardView
        schoolName={profile?.schoolName ?? ""}
        broadsheet={broadsheet}
        students={broadsheet.students}
        photoUrls={photoUrls}
        canEditRemark={canEditRemark}
        onBack={() => setPrintAllMode(false)}
      />
    );
  }

  const activeReportStudent = selectedStudentId
    ? broadsheet.students.find((s) => s.studentId === selectedStudentId) ?? null
    : null;

  if (activeReportStudent) {
    return (
      <ReportCardView
        schoolName={profile?.schoolName ?? ""}
        broadsheet={broadsheet}
        students={[activeReportStudent]}
        photoUrls={photoUrls}
        canEditRemark={canEditRemark}
        onBack={() => setSelectedStudentId(null)}
      />
    );
  }

  return (
    <section className="surface space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {broadsheet.className} · {broadsheet.termName} Broadsheet
          </h2>
          <p className="text-xs text-muted-foreground">
            Review class standings, enter class teacher remarks, and generate
            official printable PDF report cards.
          </p>
        </div>

        {broadsheet.students.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPrintAllMode(true)}
          >
            <Printer className="size-4" aria-hidden />
            View / Print all ({broadsheet.students.length}) report cards
          </Button>
        ) : null}
      </div>

      {broadsheet.students.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No active pupils are enrolled in this class.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {isNumeric ? (
                  <th className="py-2 pr-2 font-medium">Pos.</th>
                ) : null}
                <th className="py-2 pr-3 font-medium">Pupil</th>
                <th className="py-2 px-2 text-center font-medium">Subjects</th>
                {isNumeric ? (
                  <>
                    <th className="py-2 px-2 text-right font-medium">Average</th>
                    <th className="py-2 px-2 text-center font-medium">
                      Best 6 Agg.
                    </th>
                  </>
                ) : null}
                <th className="py-2 px-2 text-center font-medium">Attendance</th>
                <th className="py-2 px-2 font-medium">
                  Class Teacher&apos;s Remark
                </th>
                <th className="py-2 pl-2 text-right font-medium">Report Card</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {broadsheet.students.map((s) => {
                const draftRemark =
                  remarkDrafts[s.enrollmentId] ?? s.overallRemark;
                const remarkChanged =
                  draftRemark.trim() !== s.overallRemark.trim();
                const attended = s.attendance.present + s.attendance.late;
                return (
                  <tr key={s.enrollmentId}>
                    {isNumeric ? (
                      <td className="py-2.5 pr-2 font-semibold tabular-nums">
                        {s.rank ? `#${s.rank}` : "—"}
                      </td>
                    ) : null}
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <StudentAvatar
                          name={s.fullName}
                          url={s.photoPath ? photoUrls[s.studentId] : null}
                          className="size-8 shrink-0 text-xs"
                        />
                        <div className="min-w-0">
                          <Link
                            to={`/students/${s.studentId}`}
                            className="block truncate font-medium hover:text-primary hover:underline"
                          >
                            {s.fullName}
                          </Link>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {s.admissionNo}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center tabular-nums">
                      {s.subjectsGraded}/{s.totalSubjects}
                    </td>
                    {isNumeric ? (
                      <>
                        <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                          {s.averageScore !== null
                            ? `${s.averageScore.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="py-2.5 px-2 text-center tabular-nums">
                          {s.bestSixAggregate ?? "—"}
                        </td>
                      </>
                    ) : null}
                    <td className="py-2.5 px-2 text-center tabular-nums text-muted-foreground">
                      {s.attendance.total > 0
                        ? `${attended}/${s.attendance.total}`
                        : "—"}
                    </td>
                    <td className="py-2.5 px-2">
                      {canEditRemark ? (
                        <div className="flex items-center gap-1.5">
                          <Input
                            value={draftRemark}
                            placeholder="Overall term remark..."
                            onChange={(e) =>
                              setRemarkDrafts((prev) => ({
                                ...prev,
                                [s.enrollmentId]: e.target.value,
                              }))
                            }
                            className="h-8 min-w-44 text-xs"
                          />
                          {remarkChanged ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={saveRemarkMutation.isPending}
                              onClick={() =>
                                saveRemarkMutation.mutate({
                                  enrollmentId: s.enrollmentId,
                                  remark: draftRemark,
                                })
                              }
                              className="h-8 px-2 text-xs"
                            >
                              Save
                            </Button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {s.overallRemark || "—"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pl-2 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedStudentId(s.studentId)}
                      >
                        <FileText className="size-3.5" aria-hidden />
                        Report card
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Main Grades Page ────────────────────────────────────────────────────────

export default function GradesPage() {
  const { profile, roles } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const isStaff = hasAnyRole(roles, ["school_admin", "principal", "teacher"]);
  const isAdmin = hasAnyRole(roles, ["school_admin"]);
  const isPrincipal = hasAnyRole(roles, ["principal"]);
  const isTeacher = hasAnyRole(roles, ["teacher"]);

  if (!isStaff) {
    return <PortalGradesView />;
  }

  const paramClass = searchParams.get("class") ?? "";
  const paramTerm = searchParams.get("term") ?? "";
  const paramStudent = searchParams.get("student") ?? "";
  const paramView = searchParams.get("view") ?? (paramStudent ? "broadsheet" : "subject");

  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });
  const termsQuery = useQuery({ queryKey: ["terms"], queryFn: listTerms });

  const currentYear = useMemo(
    () =>
      yearsQuery.data?.find((y) => y.isCurrent) ?? yearsQuery.data?.[0] ?? null,
    [yearsQuery.data],
  );

  const yearTerms = useMemo(
    () =>
      (termsQuery.data ?? []).filter(
        (t) => t.academicYearId === currentYear?.id,
      ),
    [termsQuery.data, currentYear?.id],
  );

  const selectedTerm = useMemo(
    () =>
      yearTerms.find((t) => t.id === paramTerm) ??
      yearTerms.find((t) => t.isCurrent) ??
      yearTerms[0] ??
      null,
    [yearTerms, paramTerm],
  );

  const classesQuery = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: !!currentYear?.id,
  });

  const assignmentsQuery = useQuery({
    queryKey: ["teaching-assignments", profile?.id, currentYear?.id],
    queryFn: () => getMyTeachingAssignments(profile!.id, currentYear!.id),
    enabled: !!profile?.id && !!currentYear?.id && isTeacher && !isAdmin,
  });

  const visibleClasses = useMemo(() => {
    const all = classesQuery.data ?? [];
    if (isAdmin || isPrincipal) return all;
    if (isTeacher && assignmentsQuery.data) {
      return all.filter((c) => assignmentsQuery.data.teachableClassIds.has(c.id));
    }
    return all;
  }, [classesQuery.data, isAdmin, isPrincipal, isTeacher, assignmentsQuery.data]);

  const selectedClassId = useMemo(() => {
    if (paramClass && visibleClasses.some((c) => c.id === paramClass)) {
      return paramClass;
    }
    return visibleClasses[0]?.id ?? "";
  }, [paramClass, visibleClasses]);

  const classSubjectsQuery = useQuery({
    queryKey: ["class-subjects-details", selectedClassId],
    queryFn: () => listClassSubjectsWithDetails(selectedClassId),
    enabled: !!selectedClassId,
  });

  const visibleSubjects = useMemo(() => {
    const all = classSubjectsQuery.data ?? [];
    if (isAdmin || isPrincipal) return all;
    if (isTeacher && assignmentsQuery.data) {
      if (assignmentsQuery.data.classTeacherClassIds.has(selectedClassId)) {
        return all;
      }
      return all.filter((cs) =>
        assignmentsQuery.data.subjectTeacherClassSubjectIds.has(cs.id),
      );
    }
    return all;
  }, [
    classSubjectsQuery.data,
    isAdmin,
    isPrincipal,
    isTeacher,
    assignmentsQuery.data,
    selectedClassId,
  ]);

  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState("");
  const activeClassSubject = useMemo(
    () =>
      visibleSubjects.find((s) => s.id === selectedClassSubjectId) ??
      visibleSubjects[0] ??
      null,
    [visibleSubjects, selectedClassSubjectId],
  );

  const canTeachSubject = useMemo(() => {
    if (!activeClassSubject) return false;
    if (isAdmin) return true;
    if (isTeacher && assignmentsQuery.data) {
      return (
        assignmentsQuery.data.classTeacherClassIds.has(selectedClassId) ||
        assignmentsQuery.data.subjectTeacherClassSubjectIds.has(
          activeClassSubject.id,
        )
      );
    }
    return false;
  }, [activeClassSubject, isAdmin, isTeacher, assignmentsQuery.data, selectedClassId]);

  const canEditClassRemarks = useMemo(() => {
    if (isAdmin) return true;
    if (isTeacher && assignmentsQuery.data) {
      return (
        assignmentsQuery.data.classTeacherClassIds.has(selectedClassId) ||
        assignmentsQuery.data.teachableClassIds.has(selectedClassId)
      );
    }
    return false;
  }, [isAdmin, isTeacher, assignmentsQuery.data, selectedClassId]);

  const updateParams = (patch: {
    classId?: string;
    termId?: string;
    view?: "subject" | "broadsheet";
  }) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (patch.classId !== undefined) next.set("class", patch.classId);
        if (patch.termId !== undefined) next.set("term", patch.termId);
        if (patch.view !== undefined) next.set("view", patch.view);
        next.delete("student");
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header & View Mode Tabs */}
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Gradebook &amp; Report cards
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentYear
              ? `${currentYear.name} · Record Continuous Assessment (30%), Exams (70%), and terminal reports`
              : "Record assessments, term grades, and printable report cards"}
          </p>
        </div>

        <div className="inline-flex rounded-2xl border border-border bg-background/60 p-1">
          <button
            type="button"
            onClick={() => updateParams({ view: "subject" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
              paramView !== "broadsheet"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="size-4" aria-hidden />
            Subject gradebook
          </button>
          <button
            type="button"
            onClick={() => updateParams({ view: "broadsheet" })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:text-sm",
              paramView === "broadsheet"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Award className="size-4" aria-hidden />
            Broadsheet &amp; Report cards
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <section className="surface p-4 print:hidden">
        {yearsQuery.isLoading || termsQuery.isLoading || classesQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !currentYear || yearTerms.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              Set up the current academic year and at least one term before
              recording grades.
            </p>
            {isAdmin ? (
              <Button asChild size="sm">
                <Link to="/settings">Open school setup</Link>
              </Button>
            ) : null}
          </div>
        ) : visibleClasses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isTeacher && !isAdmin
              ? "You are not assigned to any class or subject for this academic year."
              : "No classes have been set up for this academic year yet."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Term" htmlFor="grades-term">
              <NativeSelect
                id="grades-term"
                value={selectedTerm?.id ?? ""}
                onChange={(e) => updateParams({ termId: e.target.value })}
              >
                {yearTerms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.isCurrent ? " (Current)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="Class" htmlFor="grades-class">
              <NativeSelect
                id="grades-class"
                value={selectedClassId}
                onChange={(e) => updateParams({ classId: e.target.value })}
              >
                {visibleClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.levelName} {c.section} ({c.studentCount}{" "}
                    {c.studentCount === 1 ? "pupil" : "pupils"})
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {paramView !== "broadsheet" ? (
              <Field label="Subject" htmlFor="grades-subject">
                <NativeSelect
                  id="grades-subject"
                  value={activeClassSubject?.id ?? ""}
                  onChange={(e) => setSelectedClassSubjectId(e.target.value)}
                  disabled={visibleSubjects.length === 0}
                >
                  {visibleSubjects.length === 0 ? (
                    <option value="">No subjects assigned</option>
                  ) : (
                    visibleSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.subjectName}
                        {s.teacherName ? ` · ${s.teacherName}` : ""}
                      </option>
                    ))
                  )}
                </NativeSelect>
              </Field>
            ) : null}
          </div>
        )}
      </section>

      {selectedClassId && selectedTerm ? (
        paramView === "broadsheet" ? (
          <BroadsheetSection
            classId={selectedClassId}
            termId={selectedTerm.id}
            canEditRemark={canEditClassRemarks}
            initialStudentId={paramStudent || undefined}
          />
        ) : !activeClassSubject ? (
          <section className="surface p-8 text-center">
            <Users
              className="mx-auto size-8 text-muted-foreground/60"
              aria-hidden
            />
            <p className="mt-2 text-sm font-medium">
              No subjects assigned to this class yet
            </p>
            {isAdmin ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Add subjects to this class in{" "}
                <Link
                  to="/settings"
                  className="font-medium text-primary underline underline-offset-4"
                >
                  School setup
                </Link>
                .
              </p>
            ) : null}
          </section>
        ) : (
          <>
            {!canTeachSubject ? (
              <div
                role="status"
                className="surface flex items-center gap-2.5 p-3.5 text-sm text-muted-foreground"
              >
                <ShieldAlert
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>
                  Read-only view. Only the assigned teacher or school
                  administrator can edit marks for{" "}
                  {activeClassSubject.subjectName}.
                </span>
              </div>
            ) : null}

            <SubjectGradebookSection
              key={`${selectedClassId}:${activeClassSubject.id}:${selectedTerm.id}`}
              classId={selectedClassId}
              classSubjectId={activeClassSubject.id}
              subjectId={activeClassSubject.subjectId}
              subjectName={activeClassSubject.subjectName}
              termId={selectedTerm.id}
              canEdit={canTeachSubject}
            />
          </>
        )
      ) : null}
    </div>
  );
}

