import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "../../../lib/permissions";
import { listUsers } from "../../../lib/data/users";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { NativeSelect, controlClass } from "../../components/fields";
import { StudentAvatar } from "../../components/StudentAvatar";
import { cn } from "../../components/ui/utils";

const ROLE_FILTERS: AppRole[] = [
  "developer", "school_admin", "principal", "teacher", "hr_officer", "accountant", "librarian",
  "receptionist", "parent", "student",
];

export default function Users() {
  const users = useQuery({ queryKey: ["users"], queryFn: listUsers });
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<AppRole | "">("");
  const [state, setState] = useState<"active" | "inactive" | "">("");

  const term = search.trim().toLowerCase();
  const rows = (users.data ?? []).filter(
    (u) =>
      (!term || u.fullName.toLowerCase().includes(term) || (u.email ?? "").toLowerCase().includes(term)) &&
      (!role || u.roles.includes(role)) &&
      (!state || (state === "active") === u.isActive),
  );

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {users.data ? `${rows.length} of ${users.data.length}` : "Loading"}
          </p>
        </div>
        <Button asChild>
          <Link to="/users/new"><Plus className="size-4" aria-hidden /> Add user</Link>
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_9rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search" aria-label="Search by name or email" placeholder="Search by name or email"
            value={search} onChange={(e) => setSearch(e.target.value)} className={cn(controlClass, "pl-9")}
          />
        </div>
        <NativeSelect aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as AppRole | "")}>
          <option value="">All roles</option>
          {ROLE_FILTERS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Status" value={state} onChange={(e) => setState(e.target.value as "active" | "inactive" | "")}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Deactivated</option>
        </NativeSelect>
      </div>

      {users.isError ? <p role="alert" className="text-sm text-destructive">The user list could not be loaded.</p> : null}
      {users.isLoading ? <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div> : null}
      {users.data && rows.length === 0 ? (
        <section className="surface p-6 text-sm text-muted-foreground">No users match.</section>
      ) : null}

      {rows.length > 0 ? (
        <ul className="surface divide-y divide-border overflow-hidden">
          {rows.map((u) => (
            <li key={u.id}>
              <Link
                to={`/users/${u.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
              >
                <StudentAvatar name={u.fullName} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{u.fullName}</div>
                  <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                </div>
                <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                  {u.roles.map((r) => (
                    <span key={r} className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs">{ROLE_LABELS[r]}</span>
                  ))}
                </div>
                {!u.isActive ? (
                  <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Deactivated</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
