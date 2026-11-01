import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  CloudOff,
  FileText,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import {
  ATTENDANCE_STATUSES,
  clearAttendanceDraft,
  getClassRosterForDate,
  getMyTeachableClassIds,
  getRecentClassAttendance,
  loadAttendanceDraft,
  saveAttendanceDraft,
  saveClassAttendance,
  shiftDateIso,
  todayIso,
  type AttendanceRosterItem,
  type AttendanceStatus,
  type DraftMap,
} from "../../../lib/data/attendance";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { StudentAvatar, usePhotoUrls } from "../../components/StudentAvatar";

const STATUS_STYLES: Record<
  AttendanceStatus,
  { active: string; badge: string; dot: string }
> = {
  present: {
    active:
      "border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 dark:border-emerald-500 dark:bg-emerald-500 dark:text-slate-950",
    badge:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  late: {
    active:
      "border-amber-500 bg-amber-500 text-white shadow-sm shadow-amber-500/25 dark:text-slate-950",
    badge:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    dot: "bg-amber-500",
  },
  excused: {
    active:
      "border-sky-600 bg-sky-600 text-white shadow-sm shadow-sky-600/25 dark:border-sky-500 dark:bg-sky-500 dark:text-slate-950",
    badge:
      "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    dot: "bg-sky-500",
  },
  absent: {
    active:
      "border-rose-600 bg-rose-600 text-white shadow-sm shadow-rose-600/25 dark:border-rose-500 dark:bg-rose-500",
    badge:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    dot: "bg-rose-500",
  },
};

function formatNiceDate(dateIso: string): string {
  const d = new Date(dateIso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type StatusFilter = "all" | "unmarked" | AttendanceStatus;

export default function AttendancePage() {
  const { profile, roles } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const isAdmin = hasAnyRole(roles, ["school_admin"]);
  const isPrincipal = hasAnyRole(roles, ["principal"]);
  const isTeacher = hasAnyRole(roles, ["teacher"]);

  const today = todayIso();
  const paramClass = searchParams.get("class") ?? "";
  const paramDate = searchParams.get("date") ?? today;
  const selectedDate = paramDate <= today ? paramDate : today;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [openNotes, setOpenNotes] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<DraftMap>({});
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const yearsQuery = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });
  const currentYear = useMemo(
    () => yearsQuery.data?.find((y) => y.isCurrent) ?? yearsQuery.data?.[0] ?? null,
    [yearsQuery.data],
  );

  const classesQuery = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: !!currentYear?.id,
  });

  const teachableQuery = useQuery({
    queryKey: ["teachable-classes", profile?.id, currentYear?.id],
    queryFn: () => getMyTeachableClassIds(profile!.id, currentYear!.id),
    enabled: !!profile?.id && !!currentYear?.id && isTeacher && !isAdmin,
  });

  const visibleClasses = useMemo(() => {
    const all = classesQuery.data ?? [];
    if (isAdmin || isPrincipal) return all;
    if (isTeacher && teachableQuery.data) {
      return all.filter((c) => teachableQuery.data.has(c.id));
    }
    return all;
  }, [classesQuery.data, isAdmin, isPrincipal, isTeacher, teachableQuery.data]);

  const selectedClassId = useMemo(() => {
    if (paramClass && visibleClasses.some((c) => c.id === paramClass)) {
      return paramClass;
    }
    return visibleClasses[0]?.id ?? "";
  }, [paramClass, visibleClasses]);

  const selectedClass = useMemo(
    () => visibleClasses.find((c) => c.id === selectedClassId) ?? null,
    [visibleClasses, selectedClassId],
  );

  const canMark = useMemo(() => {
    if (!selectedClassId) return false;
    if (isAdmin) return true;
    if (isTeacher && teachableQuery.data?.has(selectedClassId)) return true;
    return false;
  }, [selectedClassId, isAdmin, isTeacher, teachableQuery.data]);

  const setClassAndDate = (nextClassId: string, nextDate: string) => {
    const clamped = nextDate > today ? today : nextDate;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (nextClassId) next.set("class", nextClassId);
        else next.delete("class");
        if (clamped && clamped !== today) next.set("date", clamped);
        else next.delete("date");
        return next;
      },
      { replace: true },
    );
  };

  // Load any stored offline draft whenever user / class / date changes
  useEffect(() => {
    setSavedBanner(null);
    if (!selectedClassId || !selectedDate) {
      setDraft({});
      return;
    }
    const stored = loadAttendanceDraft(profile?.id ?? null, selectedClassId, selectedDate);
    setDraft(stored ?? {});
  }, [profile?.id, selectedClassId, selectedDate]);

  const rosterQuery = useQuery({
    queryKey: ["attendance-roster", selectedClassId, selectedDate],
    queryFn: () => getClassRosterForDate(selectedClassId, selectedDate),
    enabled: !!selectedClassId && !!selectedDate,
  });

  const historyQuery = useQuery({
    queryKey: ["attendance-history", selectedClassId],
    queryFn: () => getRecentClassAttendance(selectedClassId, 10),
    enabled: !!selectedClassId,
  });

  const roster = rosterQuery.data ?? [];

  // Merge server roster with any unsaved local draft
  const mergedRoster = useMemo(() => {
    return roster.map((r) => {
      const d = draft[r.enrollmentId];
      if (!d) return { ...r, dirty: false };
      const sameStatus = d.status === r.status;
      const sameNote = d.note.trim() === (r.note ?? "").trim();
      return {
        ...r,
        status: d.status,
        note: d.note,
        dirty: !(sameStatus && sameNote),
      };
    });
  }, [roster, draft]);

  const dirtyCount = useMemo(
    () => mergedRoster.filter((r) => r.dirty).length,
    [mergedRoster],
  );

  const photoIds = useMemo(
    () => roster.map((r) => (r.photoPath ? r.studentId : null)),
    [roster],
  );
  const photoUrls = usePhotoUrls(photoIds);

  const updateStudentDraft = (
    item: AttendanceRosterItem,
    patch: { status?: AttendanceStatus | null; note?: string },
  ) => {
    if (!canMark) return;
    setSavedBanner(null);
    setDraft((prev) => {
      const existing = prev[item.enrollmentId] ?? {
        status: item.status,
        note: item.note,
      };
      const nextEntry = {
        status: patch.status !== undefined ? patch.status : existing.status,
        note: patch.note !== undefined ? patch.note : existing.note,
      };
      const matchesServer =
        nextEntry.status === item.status &&
        nextEntry.note.trim() === (item.note ?? "").trim();
      const nextDraft = { ...prev };
      if (matchesServer) {
        delete nextDraft[item.enrollmentId];
      } else {
        nextDraft[item.enrollmentId] = nextEntry;
      }
      saveAttendanceDraft(profile?.id ?? null, selectedClassId, selectedDate, nextDraft);
      return nextDraft;
    });
  };

  const markBatch = (onlyUnmarked: boolean, status: AttendanceStatus = "present") => {
    if (!canMark || mergedRoster.length === 0) return;
    setSavedBanner(null);
    setDraft((prev) => {
      const nextDraft = { ...prev };
      for (const item of roster) {
        const currentStatus =
          nextDraft[item.enrollmentId] !== undefined
            ? nextDraft[item.enrollmentId].status
            : item.status;
        const currentNote =
          nextDraft[item.enrollmentId] !== undefined
            ? nextDraft[item.enrollmentId].note
            : item.note;
        if (onlyUnmarked && currentStatus !== null) continue;
        const nextStatus = status;
        const matchesServer =
          nextStatus === item.status &&
          currentNote.trim() === (item.note ?? "").trim();
        if (matchesServer) {
          delete nextDraft[item.enrollmentId];
        } else {
          nextDraft[item.enrollmentId] = {
            status: nextStatus,
            note: currentNote,
          };
        }
      }
      saveAttendanceDraft(profile?.id ?? null, selectedClassId, selectedDate, nextDraft);
      return nextDraft;
    });
  };

  const discardDraft = () => {
    clearAttendanceDraft(profile?.id ?? null, selectedClassId, selectedDate);
    setDraft({});
    setSavedBanner(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const entries = mergedRoster.map((r) => ({
        enrollmentId: r.enrollmentId,
        status: r.status,
        note: r.note,
      }));
      await saveClassAttendance(selectedDate, entries);
    },
    onSuccess: () => {
      clearAttendanceDraft(profile?.id ?? null, selectedClassId, selectedDate);
      setDraft({});
      setSavedBanner(`Register saved for ${formatNiceDate(selectedDate)}.`);
      void qc.invalidateQueries({
        queryKey: ["attendance-roster", selectedClassId, selectedDate],
      });
      void qc.invalidateQueries({
        queryKey: ["attendance-history", selectedClassId],
      });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  // Auto-sync queued draft when coming back online
  useEffect(() => {
    if (isOnline && canMark && dirtyCount > 0 && !saveMutation.isPending) {
      saveMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const counts = useMemo(() => {
    let present = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;
    let marked = 0;
    for (const r of mergedRoster) {
      if (!r.status) continue;
      marked += 1;
      if (r.status === "present") present += 1;
      else if (r.status === "late") late += 1;
      else if (r.status === "excused") excused += 1;
      else if (r.status === "absent") absent += 1;
    }
    const total = mergedRoster.length;
    const attended = present + late;
    const rate = marked > 0 ? Math.round((attended / marked) * 100) : null;
    return { total, marked, unmarked: total - marked, present, late, excused, absent, rate };
  }, [mergedRoster]);

  const filteredRoster = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mergedRoster.filter((r) => {
      if (statusFilter === "unmarked" && r.status !== null) return false;
      if (
        statusFilter !== "all" &&
        statusFilter !== "unmarked" &&
        r.status !== statusFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNo.toLowerCase().includes(q) ||
        (r.note && r.note.toLowerCase().includes(q))
      );
    });
  }, [mergedRoster, search, statusFilter]);

  const loadingSetup =
    yearsQuery.isLoading ||
    classesQuery.isLoading ||
    (isTeacher && !isAdmin && teachableQuery.isLoading);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Daily attendance
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentYear
              ? `${currentYear.name} · Mark daily class register`
              : "Take and review daily class attendance"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isOnline ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
            >
              <CloudOff className="size-3.5" aria-hidden />
              Offline — marks saved on this device
            </span>
          ) : null}
          {dirtyCount > 0 ? (
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-medium text-primary"
            >
              <Clock className="size-3.5" aria-hidden />
              {dirtyCount} unsaved {dirtyCount === 1 ? "change" : "changes"}
            </span>
          ) : null}
        </div>
      </div>

      {/* Controls bar: Class & Date */}
      <section className="surface p-4">
        {loadingSetup ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : !currentYear ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              No academic year has been set up yet.
            </p>
            {isAdmin ? (
              <Button asChild size="sm">
                <Link to="/settings">Set up academic year</Link>
              </Button>
            ) : null}
          </div>
        ) : visibleClasses.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {isTeacher && !isAdmin
                ? "You have not been assigned as a class or subject teacher for any class in this academic year."
                : "No classes have been created for the current academic year yet."}
            </p>
            {isAdmin ? (
              <Button asChild size="sm">
                <Link to="/settings">Manage classes</Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Class" htmlFor="attendance-class">
              <NativeSelect
                id="attendance-class"
                value={selectedClassId}
                onChange={(e) => setClassAndDate(e.target.value, selectedDate)}
              >
                {visibleClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.levelName} {c.section} ({c.studentCount}{" "}
                    {c.studentCount === 1 ? "pupil" : "pupils"})
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <div className="space-y-1.5">
              <label
                htmlFor="attendance-date"
                className="block text-sm font-medium leading-none"
              >
                Date
              </label>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Previous day"
                  onClick={() =>
                    setClassAndDate(selectedClassId, shiftDateIso(selectedDate, -1))
                  }
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
                <Input
                  id="attendance-date"
                  type="date"
                  max={today}
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setClassAndDate(selectedClassId, e.target.value);
                    }
                  }}
                  className="w-40 sm:w-44"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Next day"
                  disabled={selectedDate >= today}
                  onClick={() =>
                    setClassAndDate(selectedClassId, shiftDateIso(selectedDate, 1))
                  }
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
                {selectedDate !== today ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setClassAndDate(selectedClassId, today)}
                  >
                    Today
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </section>

      {selectedClass ? (
        <>
          {/* Summary strip */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            <div className="surface p-3.5">
              <div className="text-xs text-muted-foreground">Marked</div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums">
                  {counts.marked}/{counts.total}
                </span>
                {counts.rate !== null ? (
                  <span className="text-xs font-medium text-primary tabular-nums">
                    {counts.rate}%
                  </span>
                ) : null}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((f) => (f === "present" ? "all" : "present"))
              }
              className={cn(
                "surface p-3.5 text-left transition-all",
                statusFilter === "present" && "ring-2 ring-emerald-500",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-emerald-500" />
                Present
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {counts.present}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((f) => (f === "late" ? "all" : "late"))
              }
              className={cn(
                "surface p-3.5 text-left transition-all",
                statusFilter === "late" && "ring-2 ring-amber-500",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-amber-500" />
                Late
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {counts.late}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((f) => (f === "excused" ? "all" : "excused"))
              }
              className={cn(
                "surface p-3.5 text-left transition-all",
                statusFilter === "excused" && "ring-2 ring-sky-500",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-sky-500" />
                Excused
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
                {counts.excused}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((f) => (f === "absent" ? "all" : "absent"))
              }
              className={cn(
                "surface p-3.5 text-left transition-all",
                statusFilter === "absent" && "ring-2 ring-rose-500",
              )}
            >
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-rose-500" />
                Absent
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
                {counts.absent}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                setStatusFilter((f) => (f === "unmarked" ? "all" : "unmarked"))
              }
              className={cn(
                "surface p-3.5 text-left transition-all",
                statusFilter === "unmarked" && "ring-2 ring-primary",
              )}
            >
              <div className="text-xs text-muted-foreground">Unmarked</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {counts.unmarked}
              </div>
            </button>
          </div>

          {/* Read-only notice for principals or teachers viewing a class they don't teach */}
          {!canMark ? (
            <div
              role="status"
              className="surface flex items-center gap-2.5 p-3.5 text-sm text-muted-foreground"
            >
              <ShieldAlert className="size-4 shrink-0 text-primary" aria-hidden />
              <span>
                Read-only view. Only the assigned teacher or school administrator
                can record attendance for {selectedClass.levelName}{" "}
                {selectedClass.section}.
              </span>
            </div>
          ) : null}

          {/* Feedback banner */}
          <FormMessage
            error={
              saveMutation.isError ? friendlyError(saveMutation.error) : null
            }
            ok={savedBanner}
          />

          {/* Main register card */}
          <section className="surface space-y-4 p-4">
            {/* Batch actions & search bar */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {canMark && counts.total > 0 ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => markBatch(false, "present")}
                    >
                      <CheckCheck className="size-4" aria-hidden />
                      Mark all present
                    </Button>
                    {counts.unmarked > 0 && counts.unmarked < counts.total ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => markBatch(true, "present")}
                      >
                        <UserCheck className="size-4" aria-hidden />
                        Mark remaining ({counts.unmarked}) present
                      </Button>
                    ) : null}
                    {dirtyCount > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={discardDraft}
                      >
                        <RotateCcw className="size-4" aria-hidden />
                        Reset changes
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <div className="text-sm font-medium">
                    {selectedClass.levelName} {selectedClass.section} ·{" "}
                    {formatNiceDate(selectedDate)}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-48 flex-1 sm:w-64 sm:flex-initial">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    type="search"
                    placeholder="Search pupil or admission no..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                {statusFilter !== "all" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatusFilter("all")}
                  >
                    Show all ({counts.total})
                  </Button>
                ) : null}
                {canMark && counts.total > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={saveMutation.isPending || !isOnline || dirtyCount === 0}
                    onClick={() => saveMutation.mutate()}
                  >
                    <Check className="size-4" aria-hidden />
                    {saveMutation.isPending
                      ? "Saving..."
                      : dirtyCount > 0
                        ? `Save register (${dirtyCount})`
                        : "Saved"}
                  </Button>
                ) : null}
              </div>
            </div>

            {/* Roster list */}
            {rosterQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : rosterQuery.isError ? (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
              >
                <AlertCircle className="size-4 shrink-0" aria-hidden />
                <span>
                  {friendlyError(rosterQuery.error) ||
                    "Could not load the class roster."}
                </span>
              </div>
            ) : counts.total === 0 ? (
              <div className="py-10 text-center">
                <Users
                  className="mx-auto size-8 text-muted-foreground/60"
                  aria-hidden
                />
                <p className="mt-2 text-sm font-medium">
                  No active pupils enrolled in {selectedClass.levelName}{" "}
                  {selectedClass.section}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Admit or place students in this class from the{" "}
                  <Link
                    to="/students"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    Students
                  </Link>{" "}
                  section.
                </p>
              </div>
            ) : filteredRoster.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No pupils match your current filter.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredRoster.map((item, idx) => {
                  const noteOpen =
                    Boolean(openNotes[item.enrollmentId]) ||
                    Boolean(item.note.trim());
                  return (
                    <li
                      key={item.enrollmentId}
                      className={cn(
                        "py-3 transition-colors first:pt-1 last:pb-1",
                        item.dirty && "bg-primary/[0.03]",
                      )}
                    >
                      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                            {idx + 1}.
                          </span>
                          <StudentAvatar
                            name={item.fullName}
                            url={
                              item.photoPath ? photoUrls[item.studentId] : null
                            }
                            className="size-10 shrink-0 text-xs"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Link
                                to={`/students/${item.studentId}`}
                                className="truncate text-sm font-medium hover:text-primary hover:underline"
                              >
                                {item.fullName}
                              </Link>
                              {item.dirty ? (
                                <span
                                  title="Unsaved change"
                                  className="size-1.5 rounded-full bg-primary"
                                />
                              ) : null}
                            </div>
                            <div className="text-xs tabular-nums text-muted-foreground">
                              {item.admissionNo}
                            </div>
                          </div>
                        </div>

                        {/* Status pill buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 pl-8 sm:pl-0">
                          <div
                            role="group"
                            aria-label={`Attendance status for ${item.fullName}`}
                            className="grid flex-1 grid-cols-4 gap-1 sm:flex-initial sm:flex"
                          >
                            {ATTENDANCE_STATUSES.map((st) => {
                              const active = item.status === st.value;
                              const style = STATUS_STYLES[st.value];
                              return (
                                <button
                                  key={st.value}
                                  type="button"
                                  disabled={!canMark}
                                  aria-pressed={active}
                                  onClick={() =>
                                    updateStudentDraft(item, {
                                      status: active ? null : st.value,
                                    })
                                  }
                                  className={cn(
                                    "inline-flex h-9 items-center justify-center rounded-xl border px-2.5 text-xs font-semibold transition-all focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-60 sm:min-w-[4.75rem]",
                                    active
                                      ? style.active
                                      : "border-border bg-background/60 text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                                  )}
                                >
                                  <span className="sm:hidden">{st.short}</span>
                                  <span className="hidden sm:inline">
                                    {st.label}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {canMark ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Add note for ${item.fullName}`}
                              aria-expanded={noteOpen}
                              onClick={() =>
                                setOpenNotes((prev) => ({
                                  ...prev,
                                  [item.enrollmentId]: !noteOpen,
                                }))
                              }
                              className={cn(
                                "size-9 shrink-0 rounded-xl",
                                item.note.trim() && "text-primary",
                              )}
                            >
                              <FileText className="size-4" aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {/* Note input or read-only note */}
                      {noteOpen ? (
                        <div className="mt-2 pl-8">
                          {canMark ? (
                            <Input
                              type="text"
                              placeholder="Reason or note (e.g. clinic appointment, arrived 8:25am)..."
                              value={item.note}
                              maxLength={240}
                              onChange={(e) =>
                                updateStudentDraft(item, {
                                  note: e.target.value,
                                })
                              }
                              className="h-8 text-xs"
                            />
                          ) : item.note.trim() ? (
                            <p className="text-xs text-muted-foreground">
                              Note: {item.note}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Sticky bottom save bar on mobile when changes exist */}
            {canMark && dirtyCount > 0 ? (
              <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-background/95 p-3 shadow-lg backdrop-blur-md">
                <div className="text-xs sm:text-sm">
                  <span className="font-semibold tabular-nums">
                    {dirtyCount}
                  </span>{" "}
                  unsaved {dirtyCount === 1 ? "mark" : "marks"}
                  {!isOnline
                    ? " · Kept safely offline until you reconnect"
                    : ""}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={discardDraft}
                    disabled={saveMutation.isPending}
                  >
                    Discard
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saveMutation.isPending || !isOnline}
                    onClick={() => saveMutation.mutate()}
                  >
                    <Check className="size-4" aria-hidden />
                    {saveMutation.isPending ? "Saving..." : "Save register"}
                  </Button>
                </div>
              </div>
            ) : null}
          </section>

          {/* Recent class attendance history */}
          <section className="surface space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Calendar className="size-4 text-primary" aria-hidden />
                Recent attendance · {selectedClass.levelName}{" "}
                {selectedClass.section}
              </h2>
              <span className="text-xs text-muted-foreground">
                Select a day to view or edit
              </span>
            </div>

            {historyQuery.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !historyQuery.data || historyQuery.data.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                No attendance has been recorded for this class yet.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {historyQuery.data.map((day) => {
                  const attended = day.present + day.late;
                  const pct =
                    day.marked > 0
                      ? Math.round((attended / day.marked) * 100)
                      : 0;
                  const isCurrent = day.date === selectedDate;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setClassAndDate(selectedClassId, day.date)}
                      className={cn(
                        "flex flex-col justify-between gap-2 rounded-2xl border p-3 text-left transition-all hover:border-primary/40 hover:bg-primary/5",
                        isCurrent
                          ? "border-primary bg-primary/10"
                          : "border-border",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {formatNiceDate(day.date)}
                        </span>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                          {pct}%
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-muted-foreground">
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {day.present} P
                        </span>
                        {day.late > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">
                            {day.late} L
                          </span>
                        ) : null}
                        {day.excused > 0 ? (
                          <span className="text-sky-600 dark:text-sky-400">
                            {day.excused} E
                          </span>
                        ) : null}
                        {day.absent > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {day.absent} A
                          </span>
                        ) : null}
                        <span className="ml-auto">
                          {day.marked}/{day.total} marked
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
