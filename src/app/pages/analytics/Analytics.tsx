import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarCheck,
  FileSpreadsheet,
  FileText,
  FileType2,
  GraduationCap,
  Image as ImageIcon,
  Printer,
  Table as TableIcon,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { getSchoolAnalytics } from "../../../lib/data/analytics";
import {
  getInstitutionDetails,
  listAcademicYears,
  listTerms,
} from "../../../lib/data/setup";
import {
  exportAnalyticsAsCsv,
  exportAnalyticsAsDocx,
  exportAnalyticsAsExcel,
  exportAnalyticsAsImage,
  exportAnalyticsAsPdf,
} from "../../../lib/export/analyticsExport";
import { Field, NativeSelect } from "../../components/fields";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6366f1", "#0ea5e9"];

function formatMoney(amount: number, currency = "GHS"): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function Analytics() {
  const previewRef = useRef<HTMLDivElement>(null);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [selectedTermId, setSelectedTermId] = useState<string>("");
  const [exportingFormat, setExportingFormat] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const institutionQ = useQuery({
    queryKey: ["institution-details"],
    queryFn: getInstitutionDetails,
  });

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });

  const termsQ = useQuery({
    queryKey: ["terms"],
    queryFn: listTerms,
  });

  const activeYearId =
    selectedYearId ||
    yearsQ.data?.find((y) => y.isCurrent)?.id ||
    yearsQ.data?.[0]?.id ||
    "";

  const yearTerms = useMemo(
    () =>
      (termsQ.data ?? []).filter(
        (t) => !activeYearId || t.academicYearId === activeYearId,
      ),
    [termsQ.data, activeYearId],
  );

  const activeTermId =
    selectedTermId ||
    yearTerms.find((t) => t.isCurrent)?.id ||
    yearTerms[0]?.id ||
    "";

  const analyticsQ = useQuery({
    queryKey: ["school-analytics", activeYearId, activeTermId],
    queryFn: () =>
      getSchoolAnalytics({
        academicYearId: activeYearId || null,
        termId: activeTermId || null,
      }),
  });

  const institution = institutionQ.data;
  const currency = institution?.currency || "GHS";
  const schoolName = institution?.name || "School Analytics";
  const snap = analyticsQ.data;

  const handleExport = async (
    format: "pdf" | "png" | "docx" | "xlsx" | "csv",
  ) => {
    if (!snap || !previewRef.current) return;
    setExportingFormat(format);
    setExportStatus(null);
    try {
      if (format === "pdf") {
        await exportAnalyticsAsPdf(previewRef.current, schoolName);
        setExportStatus("Exported PDF report matching live preview.");
      } else if (format === "png") {
        await exportAnalyticsAsImage(previewRef.current, schoolName);
        setExportStatus("Exported high-resolution PNG snapshot.");
      } else if (format === "docx") {
        await exportAnalyticsAsDocx(previewRef.current, snap, institution);
        setExportStatus("Exported Word (.docx) report with visual snapshot & tables.");
      } else if (format === "xlsx") {
        exportAnalyticsAsExcel(snap, institution);
        setExportStatus("Exported multi-sheet Excel (.xlsx) workbook.");
      } else if (format === "csv") {
        exportAnalyticsAsCsv(snap, institution);
        setExportStatus("Exported structured CSV analytics dataset.");
      }
    } catch (err) {
      setExportStatus(
        err instanceof Error ? err.message : "Export could not be completed.",
      );
    } finally {
      setExportingFormat(null);
    }
  };

  const genderPieData = useMemo(() => {
    if (!snap) return [];
    return [
      { name: "Female Pupils", value: snap.kpis.femaleStudents },
      { name: "Male Pupils", value: snap.kpis.maleStudents },
    ].filter((d) => d.value > 0);
  }, [snap]);

  const attendancePieData = useMemo(() => {
    if (!snap) return [];
    return [
      { name: "Present", value: snap.attendanceSummary.present },
      { name: "Late", value: snap.attendanceSummary.late },
      { name: "Absent", value: snap.attendanceSummary.absent },
      { name: "Excused", value: snap.attendanceSummary.excused },
    ].filter((d) => d.value > 0);
  }, [snap]);

  return (
    <div className="w-full space-y-5">
      {/* Control & Multi-Format Export Toolbar */}
      <div className="surface flex flex-col gap-4 p-4 sm:p-5 print:hidden">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <BarChart3 className="size-6 text-primary" aria-hidden />
              Institution Analytics &amp; Intelligence
            </h1>
            <p className="text-sm text-muted-foreground">
              Wide-spectrum enrollment, attendance, academic performance, fee
              collection, and staffing analytics — exportable exactly as
              previewed below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!snap || exportingFormat !== null}
              onClick={() => void handleExport("pdf")}
            >
              <FileText className="size-4" aria-hidden />
              {exportingFormat === "pdf" ? "Generating PDF..." : "Export PDF"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!snap || exportingFormat !== null}
              onClick={() => void handleExport("png")}
            >
              <ImageIcon className="size-4" aria-hidden />
              {exportingFormat === "png" ? "Rendering PNG..." : "Image (PNG)"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!snap || exportingFormat !== null}
              onClick={() => void handleExport("docx")}
            >
              <FileType2 className="size-4" aria-hidden />
              {exportingFormat === "docx" ? "Building DOCX..." : "Word (DOCX)"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!snap || exportingFormat !== null}
              onClick={() => void handleExport("xlsx")}
            >
              <FileSpreadsheet className="size-4" aria-hidden />
              Excel (XLSX)
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!snap || exportingFormat !== null}
              onClick={() => void handleExport("csv")}
            >
              <TableIcon className="size-4" aria-hidden />
              CSV
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => window.print()}
            >
              <Printer className="size-4" aria-hidden />
              Print
            </Button>
          </div>
        </div>

        {/* Filters & Export Status */}
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <Field label="Academic year" htmlFor="analytics-year">
                <NativeSelect
                  id="analytics-year"
                  value={activeYearId}
                  onChange={(e) => {
                    setSelectedYearId(e.target.value);
                    setSelectedTermId("");
                  }}
                >
                  {(yearsQ.data ?? []).map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name} {y.isCurrent ? "(Current)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="w-48">
              <Field label="Term" htmlFor="analytics-term">
                <NativeSelect
                  id="analytics-term"
                  value={activeTermId}
                  onChange={(e) => setSelectedTermId(e.target.value)}
                >
                  {yearTerms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.isCurrent ? "(Current)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          </div>

          {exportStatus ? (
            <p
              role="status"
              aria-live="polite"
              className="text-xs font-medium text-emerald-700 dark:text-emerald-400"
            >
              {exportStatus}
            </p>
          ) : (
            <span className="text-xs text-muted-foreground">
              Live WYSIWYG Report Canvas — what you see below is what is
              exported.
            </span>
          )}
        </div>
      </div>

      {/* ─── LIVE PREVIEW & EXPORTABLE REPORT CANVAS ───────────────────────── */}
      {analyticsQ.isLoading || !snap ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <div
          ref={previewRef}
          className="surface space-y-6 overflow-hidden border border-border p-5 sm:p-8 print:border-none print:bg-white print:p-4 print:text-slate-900 print:shadow-none"
        >
          {/* Top Brand Accent Bar */}
          <div
            className="-mx-5 -mt-5 mb-4 h-2.5 sm:-mx-8 sm:-mt-8"
            style={{
              background: `linear-gradient(90deg, ${institution?.brandPrimary || "var(--primary)"}, color-mix(in srgb, ${institution?.brandPrimary || "var(--primary)"} 60%, #0f172a))`,
            }}
          />

          {/* Official Institution Header */}
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
            <div className="flex items-start gap-4">
              {institution?.logoUrl ? (
                <img
                  src={institution.logoUrl}
                  alt={`${schoolName} crest`}
                  className="size-16 shrink-0 rounded-2xl border border-border bg-white object-contain p-1"
                />
              ) : (
                <div
                  className="grid size-16 shrink-0 place-items-center rounded-2xl text-white shadow-sm"
                  style={{
                    backgroundColor:
                      institution?.brandPrimary || "var(--primary)",
                  }}
                >
                  <Building2 className="size-8" aria-hidden />
                </div>
              )}

              <div className="space-y-0.5">
                <h2 className="text-xl font-bold uppercase tracking-tight sm:text-2xl">
                  {schoolName}
                </h2>
                {institution?.motto ? (
                  <p className="text-xs italic text-muted-foreground">
                    &ldquo;{institution.motto}&rdquo;
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {[
                    institution?.address,
                    institution?.phone,
                    institution?.email,
                    institution?.website,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="inline-block rounded-lg bg-primary/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                Executive Analytics Report
              </span>
              <div className="mt-1.5 font-semibold">
                {snap.academicYearName ?? "All Years"} ·{" "}
                {snap.termName ?? "All Terms"}
              </div>
              <div className="text-muted-foreground">
                Generated:{" "}
                {new Date(snap.generatedAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </header>

          {/* ─── SECTION 1: 6 EXECUTIVE KPI CARDS ───────────────────────────── */}
          <section className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <TrendingUp className="size-4 text-primary" aria-hidden />
              1. Executive Key Performance Indicators
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <div className="rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Active Students</span>
                  <Users className="size-4 text-primary" aria-hidden />
                </div>
                <div className="mt-1.5 text-2xl font-extrabold tabular-nums">
                  {snap.kpis.activeStudents}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {snap.kpis.femaleStudents}F · {snap.kpis.maleStudents}M (
                  {snap.kpis.totalStudents} total)
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Attendance Rate</span>
                  <CalendarCheck
                    className="size-4 text-emerald-600"
                    aria-hidden
                  />
                </div>
                <div className="mt-1.5 text-2xl font-extrabold tabular-nums">
                  {snap.kpis.overallAttendanceRate !== null
                    ? `${snap.kpis.overallAttendanceRate}%`
                    : "—"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {snap.attendanceSummary.totalRecords} total marks
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Academic Mean</span>
                  <GraduationCap
                    className="size-4 text-indigo-600"
                    aria-hidden
                  />
                </div>
                <div className="mt-1.5 text-2xl font-extrabold tabular-nums">
                  {snap.kpis.overallAcademicAverage !== null
                    ? `${snap.kpis.overallAcademicAverage}%`
                    : "—"}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Pass rate:{" "}
                  {snap.kpis.overallPassRate !== null
                    ? `${snap.kpis.overallPassRate}%`
                    : "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Fees Collected</span>
                  <Wallet className="size-4 text-emerald-600" aria-hidden />
                </div>
                <div className="mt-1.5 text-xl font-extrabold text-emerald-700 tabular-nums dark:text-emerald-400">
                  {formatMoney(snap.kpis.totalCollected, currency)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  of {formatMoney(snap.kpis.totalBilled, currency)} billed (
                  {snap.kpis.collectionRate ?? 0}%)
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Fee Arrears</span>
                  <Wallet className="size-4 text-rose-600" aria-hidden />
                </div>
                <div className="mt-1.5 text-xl font-extrabold text-rose-700 tabular-nums dark:text-rose-400">
                  {formatMoney(snap.kpis.totalArrears, currency)}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Outstanding balance
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Staff &amp; Ratio</span>
                  <UserCog className="size-4 text-amber-600" aria-hidden />
                </div>
                <div className="mt-1.5 text-2xl font-extrabold tabular-nums">
                  {snap.kpis.totalStaff}
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {snap.kpis.teachingStaff} teaching · Ratio{" "}
                  {snap.kpis.studentTeacherRatio !== null
                    ? `${snap.kpis.studentTeacherRatio}:1`
                    : "—"}
                </div>
              </div>
            </div>
          </section>

          {/* ─── SECTION 2: ENROLLMENT & DEMOGRAPHICS CHARTS ─────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Users className="size-4 text-primary" aria-hidden />
              2. Enrollment Distribution &amp; Pupil Demographics
            </h3>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Enrollment by Class Bar Chart */}
              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4 lg:col-span-2">
                <div className="mb-2 text-sm font-semibold">
                  Enrollment by Class &amp; Gender Split
                </div>
                {snap.classesSummary.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    No classes configured for this academic year.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={snap.classesSummary}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          strokeOpacity={0.25}
                        />
                        <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="femaleCount"
                          name="Female"
                          stackId="a"
                          fill="#ec4899"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="maleCount"
                          name="Male"
                          stackId="a"
                          fill="#3b82f6"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Gender & Admissions Trend */}
              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4">
                <div className="mb-2 text-sm font-semibold">
                  Gender Parity &amp; Admissions
                </div>
                {genderPieData.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    No active student demographics yet.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={genderPieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          <Cell fill="#ec4899" />
                          <Cell fill="#3b82f6" />
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ─── SECTION 3: ATTENDANCE SPECTRUM ─────────────────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <CalendarCheck className="size-4 text-primary" aria-hidden />
              3. Daily Attendance Spectrum &amp; Punctuality
            </h3>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4 lg:col-span-2">
                <div className="mb-2 text-sm font-semibold">
                  Recent Daily Attendance Trend (Present vs Absent/Late)
                </div>
                {snap.dailyAttendance.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    No daily attendance records marked yet.
                  </p>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={snap.dailyAttendance}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          strokeOpacity={0.25}
                        />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Area
                          type="monotone"
                          dataKey="present"
                          name="Present"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.25}
                        />
                        <Area
                          type="monotone"
                          dataKey="late"
                          name="Late"
                          stroke="#f59e0b"
                          fill="#f59e0b"
                          fillOpacity={0.2}
                        />
                        <Area
                          type="monotone"
                          dataKey="absent"
                          name="Absent"
                          stroke="#ef4444"
                          fill="#ef4444"
                          fillOpacity={0.2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4">
                <div className="mb-2 text-sm font-semibold">
                  Attendance Status Breakdown
                </div>
                {attendancePieData.length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    No attendance records yet.
                  </p>
                ) : (
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={attendancePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={70}
                        >
                          {attendancePieData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* ─── SECTION 4: ACADEMIC PERFORMANCE & SUBJECT ANALYTICS ────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <BookOpen className="size-4 text-primary" aria-hidden />
              4. Academic Performance &amp; Subject Mastery
            </h3>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4">
                <div className="mb-2 text-sm font-semibold">
                  Subject Average Scores &amp; Pass Rates (%)
                </div>
                {snap.subjectPerformance.filter((s) => s.assessedStudents > 0)
                  .length === 0 ? (
                  <p className="py-12 text-center text-xs text-muted-foreground">
                    No subject scores recorded for this term yet.
                  </p>
                ) : (
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={snap.subjectPerformance.filter(
                          (s) => s.assessedStudents > 0,
                        )}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          strokeOpacity={0.25}
                        />
                        <XAxis dataKey="subjectName" tick={{ fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                          dataKey="averageScore"
                          name="Mean Score (%)"
                          fill="#6366f1"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="passRate"
                          name="Pass Rate >=50% (%)"
                          fill="#10b981"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4">
                <div className="mb-2 text-sm font-semibold">
                  Score Band Distribution
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      layout="vertical"
                      data={snap.scoreDistribution}
                      margin={{ left: 24 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        strokeOpacity={0.25}
                      />
                      <XAxis type="number" allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="band"
                        width={135}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip />
                      <Bar
                        dataKey="count"
                        name="Subject Entries"
                        fill="#f97316"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </section>

          {/* ─── SECTION 5: FINANCIAL & REVENUE ANALYTICS ───────────────────── */}
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <Wallet className="size-4 text-primary" aria-hidden />
              5. Financial Revenue, Billing &amp; Collection Channels
            </h3>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4 lg:col-span-2">
                <div className="mb-2 text-sm font-semibold">
                  Monthly Billing vs Fee Collection ({currency})
                </div>
                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={snap.monthlyFinance}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        strokeOpacity={0.25}
                      />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        dataKey="billed"
                        name={`Billed (${currency})`}
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        dataKey="collected"
                        name={`Collected (${currency})`}
                        fill="#10b981"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-foreground/[0.015] p-4">
                <div className="mb-2 text-sm font-semibold">
                  Invoice &amp; Payment Channel Summary
                </div>
                <div className="space-y-3 text-xs">
                  <div className="space-y-1.5">
                    <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                      By Invoice Status
                    </div>
                    {snap.invoiceStatusBreakdown.map((st) => (
                      <div
                        key={st.status}
                        className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5"
                      >
                        <span>
                          <strong>{st.status}</strong> ({st.count})
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatMoney(st.totalAmount, currency)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {snap.paymentMethods.length > 0 ? (
                    <div className="space-y-1.5 pt-2">
                      <div className="font-semibold uppercase tracking-wider text-muted-foreground">
                        By Payment Method
                      </div>
                      {snap.paymentMethods.map((pm) => (
                        <div
                          key={pm.method}
                          className="flex items-center justify-between rounded-lg border border-border/70 px-2.5 py-1.5"
                        >
                          <span>
                            {pm.method} ({pm.count})
                          </span>
                          <span className="font-mono font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                            {formatMoney(pm.amount, currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* ─── SECTION 6: DETAILED TABULAR BREAKDOWNS ─────────────────────── */}
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              <TableIcon className="size-4 text-primary" aria-hidden />
              6. Detailed Class &amp; Subject Performance Tables
            </h3>

            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-border bg-foreground/[0.03] text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 pl-4 pr-2">Class</th>
                    <th className="py-2.5 px-2">Class Teacher</th>
                    <th className="py-2.5 px-2 text-right">Pupils</th>
                    <th className="py-2.5 px-2 text-right">Female / Male</th>
                    <th className="py-2.5 px-2 text-right">Attendance Rate</th>
                    <th className="py-2.5 pl-2 pr-4 text-right">
                      Academic Mean
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {snap.classesSummary.map((c) => (
                    <tr key={c.classId}>
                      <td className="py-2.5 pl-4 pr-2 font-semibold">
                        {c.className}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {c.classTeacherName ?? "Unassigned"}
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        {c.totalStudents}
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums text-muted-foreground">
                        {c.femaleCount}F / {c.maleCount}M
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold tabular-nums">
                        {c.attendanceRate !== null
                          ? `${c.attendanceRate}%`
                          : "—"}
                      </td>
                      <td className="py-2.5 pl-2 pr-4 text-right font-semibold tabular-nums">
                        {c.averageAcademicScore !== null
                          ? `${c.averageAcademicScore}%`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="border-t border-border pt-4 text-center text-xs text-muted-foreground">
            {institution?.receiptFooter ||
              `${schoolName} — Official Institutional Analytics Report`}
          </footer>
        </div>
      )}
    </div>
  );
}
