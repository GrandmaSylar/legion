import { useEffect, useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import { useDebounced } from "../../../lib/useDebounced";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import { PAGE_SIZE, listStudents, type StudentStatus } from "../../../lib/data/students";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { NativeSelect, controlClass } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { StudentAvatar, usePhotoUrls } from "../../components/StudentAvatar";

const STATUS_LABEL: Record<StudentStatus, string> = { active: "Active", completed: "Completed", left: "Left" };

export function StatusPill({ status }: { status: StudentStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium",
        status === "active" ? "bg-primary/15 text-primary" : "bg-foreground/10 text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function StudentsList() {
  const { roles } = useAuth();
  const canAdd = hasAnyRole(roles, ["school_admin", "receptionist"]);

  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const currentYear = years.data?.find((y) => y.isCurrent) ?? null;
  const classes = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: !!currentYear,
  });

  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<StudentStatus | "">("active");
  const [page, setPage] = useState(0);
  const q = useDebounced(search);

  // Any change to the filters goes back to the first page.
  useEffect(() => setPage(0), [q, classId, status]);

  const list = useQuery({
    queryKey: ["students", { q, classId, status, page, yearId: currentYear?.id ?? null }],
    queryFn: () => listStudents({ search: q, classId, status, page, yearId: currentYear?.id ?? null }),
    placeholderData: keepPreviousData,
    enabled: years.isSuccess,
  });

  const urls = usePhotoUrls(list.data?.rows.filter((r) => r.photoPath).map((r) => r.id) ?? []);
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = !!(q || classId || status !== "active");

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Students</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {list.data ? `${total} ${total === 1 ? "student" : "students"}` : "Loading"}
          </p>
        </div>
        {canAdd ? (
          <Button asChild>
            <Link to="/students/new">
              <Plus className="size-4" aria-hidden /> Add student
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_9rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            aria-label="Search by name or admission number"
            placeholder="Search by name or admission number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={cn(controlClass, "pl-9")}
          />
        </div>
        <NativeSelect aria-label="Class" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All classes</option>
          {classes.data?.map((c) => (
            <option key={c.id} value={c.id}>{c.levelName} {c.section}</option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as StudentStatus | "")}>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="left">Left</option>
          <option value="">All</option>
        </NativeSelect>
      </div>

      {list.isError ? (
        <div role="alert" className="surface flex items-center justify-between gap-3 p-4 text-sm">
          <span>The student list could not be loaded.</span>
          <button type="button" onClick={() => void list.refetch()} className="font-medium underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : null}

      {!list.data && !list.isError ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      ) : null}

      {list.data && list.data.rows.length === 0 ? (
        <section className="surface p-6">
          <h2 className="text-base font-medium">{filtered ? "No students match" : "No students yet"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered
              ? "Try a different name, class or status."
              : canAdd
                ? "Add the first student to start the register."
                : "Students will appear here once the school adds them."}
          </p>
        </section>
      ) : null}

      {list.data && list.data.rows.length > 0 ? (
        <ul className={cn("surface divide-y divide-border overflow-hidden", list.isPlaceholderData && "opacity-60 transition-opacity")}>
          {list.data.rows.map((s) => (
            <li key={s.id}>
              <Link
                to={`/students/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <StudentAvatar name={s.fullName} url={s.photoPath ? urls[s.id] : null} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.fullName}</div>
                  <div className="truncate text-xs tabular-nums text-muted-foreground">{s.admissionNo}</div>
                </div>
                <div className="hidden text-sm text-muted-foreground sm:block">{s.className ?? "No class"}</div>
                <StatusPill status={s.status} />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="tabular-nums text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      ) : null}
    </div>
  );
}
