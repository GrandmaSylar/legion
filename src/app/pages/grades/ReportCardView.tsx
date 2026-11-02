import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  Check,
  Globe,
  GraduationCap,
  HeartHandshake,
  Lock,
  Printer,
  ShieldAlert,
  Sliders,
} from "lucide-react";
import {
  getTermReportPublication,
  listClassBehavioralAssessments,
  saveOverallRemark,
  type BroadsheetStudent,
  type ClassBroadsheet,
  type StudentBehavioralAssessment,
  type TermReportPublication,
} from "../../../lib/data/grades";
import {
  getInstitutionDetails,
  type InstitutionDetails,
} from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormMessage } from "../../components/fields";
import { StudentAvatar } from "../../components/StudentAvatar";
import { BehavioralAssessmentModal } from "./BehavioralAssessmentModal";
import { TermPublicationModal } from "./TermPublicationModal";
import { DevelopedByPhinova } from "../../components/brand/DevelopedByPhinova";
import { cn } from "../../components/ui/utils";

function ordinal(n: number | null): string {
  if (n === null || n <= 0) return "—";
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

const TRAIT_NAMES = [
  { key: "punctuality", label: "Punctuality" },
  { key: "neatness", label: "Neatness" },
  { key: "politeness", label: "Politeness" },
  { key: "attitudeToWork", label: "Attitude to Work" },
  { key: "leadership", label: "Leadership" },
] as const;

function SingleReportCardSheet({
  schoolName,
  institution,
  broadsheet,
  student,
  photoUrl,
  canEditRemark,
  behavioral,
  publication,
  classIdForInvalidate,
  onOpenBehavioralModal,
}: {
  schoolName: string;
  institution?: InstitutionDetails | null;
  broadsheet: ClassBroadsheet;
  student: BroadsheetStudent;
  photoUrl?: string | null;
  canEditRemark: boolean;
  behavioral?: StudentBehavioralAssessment | null;
  publication?: TermReportPublication | null;
  classIdForInvalidate: string;
  onOpenBehavioralModal?: () => void;
}) {
  const qc = useQueryClient();
  const [remark, setRemark] = useState(student.overallRemark);
  const isNumeric =
    broadsheet.gradingType === "ges_numeric" ||
    broadsheet.gradingType === "custom_numeric";

  const saveRemark = useMutation({
    mutationFn: () =>
      saveOverallRemark(student.enrollmentId, broadsheet.termId, remark),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["broadsheet", classIdForInvalidate, broadsheet.termId],
      });
    },
  });

  const attended = student.attendance.present + student.attendance.late;
  const totalAttendance = student.attendance.total;

  const isPublished = publication?.isPublished ?? false;

  return (
    <article className="report-card-sheet surface relative mx-auto max-w-4xl overflow-hidden border border-border p-6 sm:p-8 print:max-w-none print:rounded-none print:border-slate-300 print:bg-white print:p-6 print:text-slate-900 print:shadow-none">
      {/* Top brand accent bar */}
      <div
        className="-mx-6 -mt-6 mb-6 h-2.5 sm:-mx-8 sm:-mt-8"
        style={{
          background:
            "linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 65%, #0f172a))",
        }}
      />

      {/* Draft watermark if unpublished */}
      {!isPublished ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-1.5 text-xs text-amber-700 dark:text-amber-300 print:border-amber-300 print:bg-amber-50 print:text-amber-800">
          <div className="flex items-center gap-2">
            <Lock className="size-3.5" />
            <span className="font-semibold uppercase tracking-wider text-[11px]">
              DRAFT REPORT · FOR INTERNAL AUDIT &amp; REVIEW ONLY
            </span>
          </div>
          <span className="text-[11px] opacity-80">Unpublished</span>
        </div>
      ) : null}

      {/* School header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 print:border-slate-300">
        <div className="flex items-start gap-3.5">
          {institution?.logoUrl ? (
            <img
              src={institution.logoUrl}
              alt={`${institution.name} crest`}
              className="size-14 shrink-0 rounded-2xl border border-border bg-white object-contain p-1 print:border-slate-300"
            />
          ) : (
            <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary print:border print:border-slate-300">
              <GraduationCap className="size-8" aria-hidden />
            </div>
          )}
          <div className="space-y-0.5">
            <h2 className="text-xl font-bold uppercase tracking-tight sm:text-2xl">
              {institution?.name || schoolName || "School Report Card"}
            </h2>
            {institution?.motto ? (
              <p className="text-xs italic text-muted-foreground print:text-slate-600">
                &ldquo;{institution.motto}&rdquo;
              </p>
            ) : null}
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-slate-600">
              Official Terminal Report · {broadsheet.academicYearName} ·{" "}
              {broadsheet.termName}
            </p>
            {institution &&
            (institution.address || institution.phone || institution.email) ? (
              <p className="text-[11px] text-muted-foreground print:text-slate-600">
                {[institution.address, institution.phone, institution.email]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="text-right text-xs text-muted-foreground print:text-slate-600">
          <div className="font-semibold text-foreground print:text-slate-900">
            {broadsheet.className}
          </div>
          <div>Scale: {broadsheet.scaleName}</div>
          {publication?.vacationDate ? (
            <div>Vacation: {publication.vacationDate}</div>
          ) : null}
        </div>
      </header>

      {/* Pupil summary strip */}
      <section className="my-5 grid gap-4 rounded-2xl border border-border bg-foreground/[0.02] p-4 sm:grid-cols-[auto_1fr_auto] sm:items-center print:border-slate-300 print:bg-slate-50">
        <StudentAvatar
          name={student.fullName}
          url={photoUrl}
          className="size-16 text-base"
        />

        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3 sm:text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Pupil Name
            </div>
            <div className="font-semibold">{student.fullName}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Admission No.
            </div>
            <div className="font-semibold tabular-nums">
              {student.admissionNo}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Class / Level
            </div>
            <div className="font-semibold">{broadsheet.className}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Attendance
            </div>
            <div className="font-semibold tabular-nums">
              {totalAttendance > 0
                ? `${attended} / ${totalAttendance} days (${Math.round((attended / totalAttendance) * 100)}%)`
                : "Not recorded"}
            </div>
          </div>
          {isNumeric ? (
            <>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
                  Term Average
                </div>
                <div className="font-semibold tabular-nums">
                  {student.averageScore !== null
                    ? `${student.averageScore.toFixed(1)}%`
                    : "—"}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
                  {broadsheet.sitsBece ? "Class Position / Aggregate" : "Class Position"}
                </div>
                <div className="font-semibold tabular-nums">
                  {ordinal(student.rank)}{" "}
                  <span className="font-normal text-muted-foreground">
                    of {broadsheet.students.length}
                  </span>
                  {student.bestSixAggregate !== null
                    ? ` · Agg. ${student.bestSixAggregate}`
                    : ""}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {canEditRemark ? (
          <div className="print:hidden">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onOpenBehavioralModal}
              className="gap-1.5"
            >
              <HeartHandshake className="size-3.5" />
              <span>Traits &amp; Remarks</span>
            </Button>
          </div>
        ) : null}
      </section>

      {/* Academic results table */}
      {isNumeric ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-y border-border bg-foreground/[0.03] text-xs uppercase tracking-wider text-muted-foreground print:border-slate-300 print:bg-slate-100 print:text-slate-700">
                <th className="py-2.5 pl-3 pr-2 font-semibold">Subject</th>
                <th className="py-2.5 px-2 text-right font-semibold">
                  Class Score (30%)
                </th>
                <th className="py-2.5 px-2 text-right font-semibold">
                  Exam Score (70%)
                </th>
                <th className="py-2.5 px-2 text-right font-semibold">
                  Total (100%)
                </th>
                <th className="py-2.5 px-2 text-center font-semibold">Grade</th>
                <th className="py-2.5 pl-2 pr-3 font-semibold">Remark</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border print:divide-slate-200">
              {student.subjects.map((sub) => (
                <tr key={sub.subjectId}>
                  <td className="py-2.5 pl-3 pr-2 font-medium">
                    {sub.subjectName}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    {sub.caTotal !== null ? sub.caTotal.toFixed(1) : "—"}
                  </td>
                  <td className="py-2.5 px-2 text-right tabular-nums">
                    {sub.examScore !== null ? sub.examScore.toFixed(1) : "—"}
                  </td>
                  <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                    {sub.total !== null ? sub.total.toFixed(1) : "—"}
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold tabular-nums">
                    {sub.grade ?? "—"}
                  </td>
                  <td className="py-2.5 pl-2 pr-3 text-muted-foreground print:text-slate-700">
                    {sub.remark ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-y border-border bg-foreground/[0.03] text-xs uppercase tracking-wider text-muted-foreground print:border-slate-300 print:bg-slate-100 print:text-slate-700">
                <th className="w-1/3 py-2.5 pl-3 pr-2 font-semibold">
                  Learning Area / Subject
                </th>
                <th className="py-2.5 pl-2 pr-3 font-semibold">
                  Teacher&apos;s Observation &amp; Progress Remark
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border print:divide-slate-200">
              {student.subjects.map((sub) => (
                <tr key={sub.subjectId}>
                  <td className="py-2.5 pl-3 pr-2 font-medium">
                    {sub.subjectName}
                  </td>
                  <td className="py-2.5 pl-2 pr-3">
                    {sub.descriptiveRemark || (
                      <span className="text-muted-foreground">
                        Not recorded yet
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Affective & Behavioral Traits Strip (1-5 Scale) */}
      {behavioral ? (
        <div className="mt-4 rounded-xl border border-border bg-foreground/[0.02] p-3 text-xs print:border-slate-300">
          <div className="mb-2 font-semibold uppercase tracking-wider text-muted-foreground print:text-slate-600">
            Affective &amp; Psychomotor Domains (Rating: 1 = Unsatisfactory ... 5 = Exemplary)
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
            {TRAIT_NAMES.map(({ key, label }) => {
              const val = behavioral[key];
              return (
                <div key={key} className="rounded-lg border border-border/60 bg-card p-2 text-center print:border-slate-200">
                  <div className="text-[11px] text-muted-foreground print:text-slate-500 truncate">{label}</div>
                  <div className="mt-0.5 text-sm font-bold tabular-nums text-foreground">
                    {val !== null ? `${val} / 5` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Grading scale legend (numeric only) */}
      {isNumeric && broadsheet.bands.length > 0 ? (
        <div className="mt-3 rounded-xl border border-border bg-foreground/[0.02] p-3 text-xs print:border-slate-300">
          <div className="mb-1.5 font-semibold uppercase tracking-wider text-muted-foreground print:text-slate-600">
            Grading Scale Key ({broadsheet.scaleName})
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
            {broadsheet.bands.map((b) => (
              <span key={b.id}>
                <strong>{b.grade}</strong>: {b.minScore}–{Math.floor(b.maxScore)}% (
                {b.remark})
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Remarks, Promotional Status, and Next Term Info */}
      <footer className="mt-6 space-y-4 border-t border-border pt-4 print:border-slate-300">
        {/* Class Teacher Remark */}
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-slate-600">
            Class Teacher&apos;s Remarks
          </div>
          <p className="rounded-xl border border-border/70 bg-foreground/[0.02] p-2.5 text-xs italic print:border-slate-300">
            {behavioral?.teacherRemarks || student.overallRemark || "Satisfactory academic performance and steady classroom conduct."}
          </p>
        </div>

        {/* Headteacher Endorsement */}
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-slate-600">
            Headteacher&apos;s Endorsement &amp; Recommendation
          </div>
          <p className="rounded-xl border border-border/70 bg-foreground/[0.02] p-2.5 text-xs italic print:border-slate-300">
            {behavioral?.headteacherRemarks || "Approved. Commended for diligent academic effort this term."}
          </p>
        </div>

        {/* Next Term Logistics & Promotional Decision */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-border bg-foreground/[0.02] p-3 text-xs print:border-slate-300">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Promotional Decision
            </div>
            <div className="mt-0.5 font-bold uppercase text-primary print:text-slate-900">
              {behavioral?.promotionalStatus === "promoted"
                ? "Promoted to Next Level"
                : behavioral?.promotionalStatus === "promoted_on_trial"
                  ? "Promoted on Trial"
                  : behavioral?.promotionalStatus === "repeated"
                    ? "Repeated / Repeat Level"
                    : behavioral?.promotionalStatus === "withdrawn"
                      ? "Withdrawn"
                      : "Term in Progress"}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Next Term Begins
            </div>
            <div className="mt-0.5 font-semibold text-foreground print:text-slate-900">
              {publication?.reopeningDate || "To be communicated"}
            </div>
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Next Term Fees Due
            </div>
            <div className="mt-0.5 font-semibold text-foreground print:text-slate-900">
              {publication?.nextTermFees !== null && publication?.nextTermFees !== undefined
                ? `GHS ${publication.nextTermFees.toFixed(2)}`
                : "Refer to bill"}
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 pt-4 text-xs text-muted-foreground print:text-slate-600">
          <div className="border-t border-border pt-2 print:border-slate-400">
            <div className="font-medium text-foreground print:text-slate-900">
              {broadsheet.classTeacherName ?? "Class Teacher"}
            </div>
            <div>Class Teacher&apos;s Signature</div>
          </div>
          <div className="border-t border-border pt-2 print:border-slate-400">
            <div className="font-medium text-foreground print:text-slate-900">
              Headteacher / Principal
            </div>
            <div>Headteacher&apos;s Signature &amp; Stamp</div>
          </div>
        </div>

        {/* Hallmark */}
        <div className="pt-2 flex justify-between items-center text-[10px] text-muted-foreground/60 border-t border-border/40">
          <span>Legion School Management System · Official Certified Report</span>
          <DevelopedByPhinova variant="minimal" />
        </div>
      </footer>
    </article>
  );
}

export function ReportCardView({
  schoolName,
  broadsheet,
  students,
  photoUrls,
  canEditRemark,
  onBack,
}: {
  schoolName: string;
  broadsheet: ClassBroadsheet;
  students: BroadsheetStudent[];
  photoUrls: Record<string, string>;
  canEditRemark: boolean;
  onBack?: () => void;
}) {
  const institutionQ = useQuery({
    queryKey: ["institution-details"],
    queryFn: getInstitutionDetails,
  });

  const behavioralQ = useQuery({
    queryKey: ["class-behavioral-assessments", broadsheet.classId, broadsheet.termId],
    queryFn: () => listClassBehavioralAssessments(broadsheet.classId, broadsheet.termId),
  });

  const publicationQ = useQuery({
    queryKey: ["term-publication", broadsheet.classId, broadsheet.termId],
    queryFn: () => getTermReportPublication(broadsheet.classId, broadsheet.termId),
  });

  const [activeModalStudent, setActiveModalStudent] = useState<BroadsheetStudent | null>(null);
  const [publicationModalOpen, setPublicationModalOpen] = useState(false);

  const behavioralMap = behavioralQ.data ?? {};
  const publication = publicationQ.data;

  return (
    <div className="space-y-4">
      {/* Top action toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to class broadsheet
          </Button>
        ) : (
          <div />
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canEditRemark ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPublicationModalOpen(true)}
              className="gap-1.5"
            >
              <Globe className="size-4" />
              <span>
                {publication?.isPublished ? "Published Settings" : "Publish Reports"}
              </span>
            </Button>
          ) : null}

          <Button type="button" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            {students.length > 1
              ? `Print All (${students.length}) Class Reports`
              : "Print / Save as PDF"}
          </Button>
        </div>
      </div>

      {/* Report Cards Stream */}
      <div className="space-y-8 print:space-y-0">
        {students.map((student, idx) => (
          <div
            key={student.enrollmentId}
            className={
              idx < students.length - 1 ? "print:break-after-page" : ""
            }
          >
            <SingleReportCardSheet
              schoolName={schoolName}
              institution={institutionQ.data}
              broadsheet={broadsheet}
              student={student}
              photoUrl={student.photoPath ? photoUrls[student.studentId] : null}
              canEditRemark={canEditRemark}
              behavioral={behavioralMap[student.enrollmentId] ?? null}
              publication={publication}
              classIdForInvalidate={broadsheet.classId}
              onOpenBehavioralModal={() => setActiveModalStudent(student)}
            />
          </div>
        ))}
      </div>

      {/* Behavioral assessment modal */}
      {activeModalStudent ? (
        <BehavioralAssessmentModal
          open={!!activeModalStudent}
          onOpenChange={(v) => (!v ? setActiveModalStudent(null) : null)}
          enrollmentId={activeModalStudent.enrollmentId}
          studentName={activeModalStudent.fullName}
          admissionNo={activeModalStudent.admissionNo}
          className={broadsheet.className}
          termId={broadsheet.termId}
          termName={broadsheet.termName}
          currentAssessment={behavioralMap[activeModalStudent.enrollmentId] ?? null}
          onSaved={() => {
            void behavioralQ.refetch();
          }}
        />
      ) : null}

      {/* Term publication settings modal */}
      <TermPublicationModal
        open={publicationModalOpen}
        onOpenChange={setPublicationModalOpen}
        classId={broadsheet.classId}
        className={broadsheet.className}
        termId={broadsheet.termId}
        termName={broadsheet.termName}
        currentPublication={publication}
        onSaved={() => {
          void publicationQ.refetch();
        }}
      />
    </div>
  );
}
