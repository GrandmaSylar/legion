import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Download,
  History,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  AUDIT_TABLES,
  listAuditLogs,
  type AuditAction,
  type AuditLogEntry,
} from "../../../lib/data/audit";
import { NativeSelect } from "../../components/fields";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";

function ActionBadge({ action }: { action: AuditAction }) {
  const styles: Record<AuditAction, string> = {
    INSERT: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    UPDATE: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  };
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styles[action]}`}
    >
      {action}
    </span>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function exportAuditCsv(rows: AuditLogEntry[]) {
  const headers = [
    "Audit ID",
    "Timestamp",
    "Action",
    "Table",
    "Row ID",
    "Actor Name",
    "Actor Email",
    "Summary",
    "Changed Fields",
  ];
  const escapeCsv = (val: string) =>
    `"${String(val ?? "").replace(/"/g, '""')}"`;

  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) =>
      [
        String(r.id),
        r.at,
        r.action,
        r.tableName,
        r.rowId ?? "",
        r.actorName ?? "System / Trigger",
        r.actorEmail ?? "",
        r.summary,
        r.diffs.map((d) => `${d.field}: ${d.before} -> ${d.after}`).join("; "),
      ]
        .map(escapeCsv)
        .join(","),
    ),
  ];

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `security-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditLogTab() {
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const auditQ = useQuery({
    queryKey: ["audit-logs", tableFilter, actionFilter],
    queryFn: () =>
      listAuditLogs({
        tableName: tableFilter,
        action: actionFilter,
        limit: 250,
      }),
  });

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (auditQ.data ?? []).filter((r) => {
      if (!q) return true;
      const hay = [
        r.summary,
        r.tableName,
        r.action,
        r.actorName ?? "",
        r.actorEmail ?? "",
        r.rowId ?? "",
        ...r.diffs.map((d) => `${d.field} ${d.before} ${d.after}`),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [auditQ.data, searchQuery]);

  const stats = useMemo(() => {
    const all = auditQ.data ?? [];
    let inserts = 0;
    let updates = 0;
    let deletes = 0;
    for (const r of all) {
      if (r.action === "INSERT") inserts += 1;
      else if (r.action === "UPDATE") updates += 1;
      else if (r.action === "DELETE") deletes += 1;
    }
    return { total: all.length, inserts, updates, deletes };
  }, [auditQ.data]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Loaded Audit Events</span>
            <ShieldCheck className="size-4 text-primary" aria-hidden />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums">
            {auditQ.isLoading ? <Skeleton className="h-7 w-16" /> : stats.total}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Immutable database trigger trail
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Records Created (INSERT)</span>
            <PlusCircle className="size-4 text-emerald-500" aria-hidden />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {auditQ.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              stats.inserts
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            New admissions, invoices, payments &amp; scores
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Records Modified (UPDATE)</span>
            <History className="size-4 text-amber-500" aria-hidden />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
            {auditQ.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              stats.updates
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Grade edits, status changes &amp; approvals
          </p>
        </div>

        <div className="surface p-4">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Records Deleted (DELETE)</span>
            <Trash2 className="size-4 text-rose-500" aria-hidden />
          </div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums text-rose-600 dark:text-rose-400">
            {auditQ.isLoading ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              stats.deletes
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Removed entries &amp; revoked roles
          </p>
        </div>
      </div>

      {/* Filter & Export Controls */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">
              Security &amp; Data Change Audit Trail
            </h2>
            <p className="text-xs text-muted-foreground">
              Every write to students, scores, results, invoices, payments,
              expenses, staff, and roles is automatically logged with before and
              after snapshots. Click any row to inspect field-level diffs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void auditQ.refetch()}
              disabled={auditQ.isFetching}
            >
              <RefreshCw className="size-3.5" aria-hidden /> Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={filtered.length === 0}
              onClick={() => exportAuditCsv(filtered)}
            >
              <Download className="size-3.5" aria-hidden /> Export CSV (
              {filtered.length})
            </Button>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_13rem_10rem]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="Search actor, student, receipt #, field value…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <NativeSelect
            aria-label="Filter by table"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
          >
            <option value="all">All audited tables</option>
            {AUDIT_TABLES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} ({t.value})
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            aria-label="Filter by action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">All actions</option>
            <option value="INSERT">INSERT (Created)</option>
            <option value="UPDATE">UPDATE (Modified)</option>
            <option value="DELETE">DELETE (Removed)</option>
          </NativeSelect>
        </div>

        {auditQ.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No audit events match your current filters.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border">
            {filtered.map((entry) => {
              const isOpen = expandedId === entry.id;
              return (
                <div key={entry.id} className="text-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(isOpen ? null : entry.id)
                    }
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {isOpen ? (
                        <ChevronDown
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      ) : (
                        <ChevronRight
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      <ActionBadge action={entry.action} />
                      <span className="rounded-md bg-foreground/[0.06] px-2 py-0.5 font-mono text-xs">
                        {entry.tableName}
                      </span>
                      <span className="truncate font-medium">
                        {entry.summary}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>
                        {entry.actorName || "System / Trigger"}
                        {entry.actorEmail ? ` (${entry.actorEmail})` : ""}
                      </span>
                      <span className="tabular-nums">
                        {formatDateTime(entry.at)}
                      </span>
                    </div>
                  </button>

                  {isOpen ? (
                    <div className="border-t border-border/60 bg-foreground/[0.02] px-4 py-3.5 space-y-3">
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          <strong>Audit Event ID:</strong> #{entry.id}
                        </span>
                        {entry.rowId ? (
                          <span>
                            <strong>Record UUID:</strong>{" "}
                            <code className="font-mono">{entry.rowId}</code>
                          </span>
                        ) : null}
                        <span>
                          <strong>Actor:</strong>{" "}
                          {entry.actorName ?? "Database Trigger"}
                        </span>
                      </div>

                      {entry.diffs.length > 0 ? (
                        <div className="overflow-x-auto rounded-xl border border-border bg-background">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-border bg-foreground/[0.03] text-muted-foreground">
                                <th className="px-3 py-2 font-semibold">
                                  Field
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  Before
                                </th>
                                <th className="px-3 py-2 font-semibold">
                                  After
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border font-mono">
                              {entry.diffs.map((d) => (
                                <tr key={d.field}>
                                  <td className="px-3 py-1.5 font-semibold text-foreground">
                                    {d.field}
                                  </td>
                                  <td className="px-3 py-1.5 text-rose-600 dark:text-rose-400 break-all">
                                    {d.before}
                                  </td>
                                  <td className="px-3 py-1.5 text-emerald-700 dark:text-emerald-300 break-all">
                                    {d.after}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No field changes detected.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

