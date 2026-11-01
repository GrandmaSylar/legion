import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, GraduationCap, Printer } from "lucide-react";
import {
  saveOverallRemark,
  type BroadsheetStudent,
  type ClassBroadsheet,
} from "../../../lib/data/grades";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormMessage } from "../../components/fields";
import { StudentAvatar } from "../../components/StudentAvatar";

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

function SingleReportCardSheet({
  schoolName,
  broadsheet,
  student,
  photoUrl,
  canEditRemark,
  classIdForInvalidate,
}: {
  schoolName: string;
  broadsheet: ClassBroadsheet;
  student: BroadsheetStudent;
  photoUrl?: string | null;
  canEditRemark: boolean;
  classIdForInvalidate: string;
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

  return (
    <article className="report-card-sheet surface mx-auto max-w-4xl overflow-hidden border border-border p-6 sm:p-8 print:max-w-none print:rounded-none print:border-slate-300 print:bg-white print:p-6 print:text-slate-900 print:shadow-none">
      {/* Top brand bar */}
      <div
        className="-mx-6 -mt-6 mb-6 h-2.5 sm:-mx-8 sm:-mt-8"
        style={{
          background:
            "linear-gradient(90deg, var(--primary), color-mix(in srgb, var(--primary) 65%, #0f172a))",
        }}
      />

      {/* School header */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 print:border-slate-300">
        <div className="flex items-center gap-3.5">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary print:border print:border-slate-300">
            <GraduationCap className="size-8" aria-hidden />
          </div>
          <div>
            <h2 className="text-xl font-bold uppercase tracking-tight sm:text-2xl">
              {schoolName || "School Report Card"}
            </h2>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground print:text-slate-600">
              Official Terminal Report · {broadsheet.academicYearName} ·{" "}
              {broadsheet.termName}
            </p>
          </div>
        </div>

        <div className="text-right text-xs text-muted-foreground print:text-slate-600">
          <div className="font-semibold text-foreground print:text-slate-900">
            {broadsheet.className}
          </div>
          <div>Scale: {broadsheet.scaleName}</div>
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

      {/* Grading scale legend (numeric only) */}
      {isNumeric && broadsheet.bands.length > 0 ? (
        <div className="mt-4 rounded-xl border border-border bg-foreground/[0.02] p-3 text-xs print:border-slate-300">
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

      {/* Overall Class Teacher's Remark & Signatures */}
      <footer className="mt-6 space-y-5 border-t border-border pt-4 print:border-slate-300">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-slate-600">
            Class Teacher&apos;s Overall Remark
          </div>
          {canEditRemark ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Input
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Enter overall term remark on conduct, attitude, and academic progress..."
                  className="flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={
                    saveRemark.isPending ||
                    remark.trim() === student.overallRemark.trim()
                  }
                  onClick={() => saveRemark.mutate()}
                >
                  <Check className="size-3.5" aria-hidden />
                  {saveRemark.isPending ? "Saving..." : "Save remark"}
                </Button>
              </div>
              <FormMessage
                error={
                  saveRemark.isError ? friendlyError(saveRemark.error) : null
                }
              />
              <p className="hidden text-sm italic print:block">
                {remark.trim() || "No overall remark recorded."}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-border/70 bg-foreground/[0.02] p-3 text-sm italic print:border-slate-300">
              {student.overallRemark || "No overall remark recorded."}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 pt-6 text-xs text-muted-foreground print:text-slate-600">
          <div className="border-t border-border pt-2 print:border-slate-400">
            <div className="font-medium text-foreground print:text-slate-900">
              {broadsheet.classTeacherName ?? "Class Teacher"}
            </div>
            <div>Class Teacher&apos;s Signature</div>
          </div>
          <div className="border-t border-border pt-2 print:border-slate-400">
            <div className="font-medium text-foreground print:text-slate-900">
              Head Teacher / Principal
            </div>
            <div>Head Teacher&apos;s Signature &amp; Stamp</div>
          </div>
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
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {onBack ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="size-4" aria-hidden />
            Back to class broadsheet
          </Button>
        ) : (
          <div />
        )}
        <Button type="button" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden />
          {students.length > 1
            ? `Print / Save all (${students.length}) PDFs`
            : "Print / Save as PDF"}
        </Button>
      </div>

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
              broadsheet={broadsheet}
              student={student}
              photoUrl={student.photoPath ? photoUrls[student.studentId] : null}
              canEditRemark={canEditRemark}
              classIdForInvalidate={broadsheet.classId}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

