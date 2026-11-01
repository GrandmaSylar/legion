import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Bell,
  CalendarCheck,
  ChevronRight,
  FileText,
  GraduationCap,
  Pin,
  User,
} from "lucide-react";
import { useAuth } from "../../lib/auth/AuthProvider";
import {
  getStudentAttendance,
  todayIso,
  type AttendanceStatus,
} from "../../lib/data/attendance";
import {
  getMyViewableStudents,
  getStudentGradesOverview,
} from "../../lib/data/grades";
import { listNotices } from "../../lib/data/notices";
import { StudentAvatar, usePhotoUrls } from "../components/StudentAvatar";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import { cn } from "../components/ui/utils";

const STATUS_PILL: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  present: {
    label: "Present",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  late: {
    label: "Late",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  excused: {
    label: "Excused",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  absent: {
    label: "Absent",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

export function PortalDashboard() {
  const { profile, roles } = useAuth();
  const isParent = roles.includes("parent");

  const studentsQuery = useQuery({
    queryKey: ["my-viewable-students"],
    queryFn: getMyViewableStudents,
  });
  const noticesQuery = useQuery({
    queryKey: ["notices"],
    queryFn: () => listNotices(8),
  });

  const students = studentsQuery.data ?? [];
  const [selectedId, setSelectedId] = useState("");
  const activeStudent =
    students.find((s) => s.id === selectedId) ?? students[0] ?? null;

  const photoUrls = usePhotoUrls(
    students.map((s) => (s.photoPath ? s.id : null)),
  );

  const attendanceQuery = useQuery({
    queryKey: ["student-attendance", activeStudent?.id],
    queryFn: () => getStudentAttendance(activeStudent!.id),
    enabled: !!activeStudent?.id,
  });

  const gradesQuery = useQuery({
    queryKey: ["student-grades-overview", activeStudent?.id],
    queryFn: () => getStudentGradesOverview(activeStudent!.id),
    enabled: !!activeStudent?.id,
  });

  const firstName = profile?.fullName.split(" ")[0] ?? "";
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (studentsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const att = attendanceQuery.data;
  const attendedDays = (att?.present ?? 0) + (att?.late ?? 0);
  const totalDays = att?.total ?? 0;
  const attRate =
    totalDays > 0 ? Math.round((attendedDays / totalDays) * 100) : null;
  const todayMark = att?.recent.find((r) => r.date === todayIso()) ?? null;

  const latestTerm = gradesQuery.data?.[0] ?? null;
  const latestAverage =
    latestTerm && latestTerm.results.length > 0
      ? Math.round(
          (latestTerm.results.reduce((acc, r) => acc + r.total, 0) /
            latestTerm.results.length) *
            10,
        ) / 10
      : null;

  const notices = noticesQuery.data ?? [];
  const currentEnrol = activeStudent?.enrollments[0] ?? null;

  return (
    <div className="w-full space-y-4 sm:space-y-6">
      {/* Greeting */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            {dateLabel}
          </p>
          <h1 className="mt-1 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            Hi, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {isParent
              ? `Parent portal · ${profile?.schoolName}`
              : `Student portal · ${profile?.schoolName}`}
          </p>
        </div>

        {/* Child switcher when a parent has more than 1 linked student */}
        {students.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {students.map((s) => {
              const active = s.id === activeStudent?.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                    active
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  <StudentAvatar
                    name={s.fullName}
                    url={s.photoPath ? photoUrls[s.id] : null}
                    className="size-5 text-[10px]"
                  />
                  {s.fullName.split(" ")[0]}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {!activeStudent ? (
        <section className="surface p-6 text-sm text-muted-foreground">
          No student record is linked to your account yet. Please contact the
          school office.
        </section>
      ) : (
        <>
          {/* Student Banner */}
          <section className="surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-4">
              <StudentAvatar
                name={activeStudent.fullName}
                url={
                  activeStudent.photoPath
                    ? photoUrls[activeStudent.id]
                    : null
                }
                className="size-16 text-lg"
              />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold sm:text-2xl">
                  {activeStudent.fullName}
                </h2>
                <p className="text-xs tabular-nums text-muted-foreground sm:text-sm">
                  {activeStudent.admissionNo}
                  {currentEnrol
                    ? ` · ${currentEnrol.className} (${currentEnrol.academicYearName})`
                    : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`/students/${activeStudent.id}`}>
                  <User className="size-4" aria-hidden />
                  Student details
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/grades">
                  <FileText className="size-4" aria-hidden />
                  Report card
                </Link>
              </Button>
            </div>
          </section>

          {/* Summary Stat Cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <section
              className="lift relative isolate flex flex-col justify-between overflow-hidden rounded-3xl p-5 text-white shadow-lg shadow-primary/30"
              style={{
                backgroundImage:
                  "linear-gradient(135deg, var(--primary), color-mix(in srgb, var(--primary) 68%, #6b1a00))",
              }}
            >
              <CalendarCheck
                aria-hidden
                strokeWidth={1.4}
                className="pointer-events-none absolute -bottom-4 -right-4 -z-10 size-28 -rotate-12 opacity-20"
              />
              <div className="text-xs font-medium text-white/85">
                Attendance rate
              </div>
              <div className="mt-3 text-4xl font-extrabold tabular-nums">
                {attendanceQuery.isLoading ? (
                  <Skeleton className="h-9 w-20 bg-white/20" />
                ) : attRate !== null ? (
                  `${attRate}%`
                ) : (
                  "—"
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/90">
                <span>
                  {totalDays > 0
                    ? `${attendedDays} of ${totalDays} days present`
                    : "No days recorded yet"}
                </span>
                {todayMark ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                    Today: {STATUS_PILL[todayMark.status].label}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="surface lift flex flex-col justify-between rounded-3xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Latest term average</span>
                <GraduationCap className="size-4 text-primary" aria-hidden />
              </div>
              <div className="mt-3 text-4xl font-extrabold tabular-nums">
                {gradesQuery.isLoading ? (
                  <Skeleton className="h-9 w-20" />
                ) : latestAverage !== null ? (
                  `${latestAverage.toFixed(1)}%`
                ) : latestTerm ? (
                  `${latestTerm.descriptiveRemarks.length} areas`
                ) : (
                  "—"
                )}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                {latestTerm
                  ? `${latestTerm.termName} (${latestTerm.yearName})`
                  : "No terminal results published yet"}
              </div>
            </section>

            <section className="surface lift flex flex-col justify-between rounded-3xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>School notices</span>
                <Bell className="size-4 text-primary" aria-hidden />
              </div>
              <div className="mt-3 text-4xl font-extrabold tabular-nums">
                {noticesQuery.isLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  notices.length
                )}
              </div>
              <div className="mt-3">
                <Link
                  to="/notices"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Open notice board <ChevronRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </section>
          </div>

          {/* 3 Main Content Panels */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Panel 1: Attendance Log */}
            <section className="surface space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <CalendarCheck className="size-4 text-primary" aria-hidden />
                  Attendance log
                </h3>
              </div>

              {attendanceQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !att || att.total === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No attendance entries recorded yet.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                    <div className="rounded-xl border border-border p-2">
                      <div className="text-[11px] text-muted-foreground">
                        Present
                      </div>
                      <div className="mt-0.5 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {att.present}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border p-2">
                      <div className="text-[11px] text-muted-foreground">
                        Late
                      </div>
                      <div className="mt-0.5 font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {att.late}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border p-2">
                      <div className="text-[11px] text-muted-foreground">
                        Excused
                      </div>
                      <div className="mt-0.5 font-bold tabular-nums text-sky-600 dark:text-sky-400">
                        {att.excused}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border p-2">
                      <div className="text-[11px] text-muted-foreground">
                        Absent
                      </div>
                      <div className="mt-0.5 font-bold tabular-nums text-rose-600 dark:text-rose-400">
                        {att.absent}
                      </div>
                    </div>
                  </div>

                  <ul className="divide-y divide-border text-xs sm:text-sm">
                    {att.recent.slice(0, 6).map((item) => {
                      const pill = STATUS_PILL[item.status];
                      return (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 py-2"
                        >
                          <div>
                            <div className="font-medium tabular-nums">
                              {item.date}
                            </div>
                            {item.note ? (
                              <div className="text-xs text-muted-foreground">
                                {item.note}
                              </div>
                            ) : null}
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${pill.className}`}
                          >
                            {pill.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>

            {/* Panel 2: Latest Grades & Remarks */}
            <section className="surface space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Award className="size-4 text-primary" aria-hidden />
                  Latest grades
                </h3>
                <Link
                  to="/grades"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Full report
                </Link>
              </div>

              {gradesQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : !latestTerm ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No grades or observations have been recorded yet.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-muted-foreground">
                    {latestTerm.termName} · {latestTerm.className}
                  </div>

                  {latestTerm.results.length > 0 ? (
                    <ul className="divide-y divide-border text-xs sm:text-sm">
                      {latestTerm.results.slice(0, 7).map((r) => (
                        <li
                          key={r.subjectId}
                          className="flex items-center justify-between gap-2 py-2"
                        >
                          <span className="truncate font-medium">
                            {r.subjectName}
                          </span>
                          <span className="flex items-center gap-2 tabular-nums">
                            <span className="font-semibold">
                              {r.total.toFixed(1)}%
                            </span>
                            {r.grade ? (
                              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
                                {r.grade}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul className="divide-y divide-border text-xs sm:text-sm">
                      {latestTerm.descriptiveRemarks.slice(0, 6).map((r) => (
                        <li key={r.subjectId} className="space-y-0.5 py-2">
                          <div className="font-medium">{r.subjectName}</div>
                          <div className="text-xs text-muted-foreground">
                            {r.remark}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {latestTerm.overallRemark ? (
                    <p className="rounded-xl border border-border/70 bg-foreground/[0.02] p-2.5 text-xs italic text-muted-foreground">
                      “{latestTerm.overallRemark}”
                    </p>
                  ) : null}
                </div>
              )}
            </section>

            {/* Panel 3: Announcements */}
            <section className="surface space-y-3 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Bell className="size-4 text-primary" aria-hidden />
                  Announcements
                </h3>
                <Link
                  to="/notices"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  All notices
                </Link>
              </div>

              {noticesQuery.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : notices.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">
                  No announcements have been posted yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {notices.slice(0, 5).map((n) => (
                    <li key={n.id} className="space-y-1 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {n.pinned ? (
                          <Pin
                            className="size-3 shrink-0 text-primary"
                            aria-hidden
                          />
                        ) : null}
                        <Link
                          to="/notices"
                          className="truncate text-sm font-medium hover:text-primary hover:underline"
                        >
                          {n.title}
                        </Link>
                      </div>
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
