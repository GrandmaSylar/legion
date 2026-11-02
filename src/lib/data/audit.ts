import { supabase } from "../supabase";

export type AuditAction = "INSERT" | "UPDATE" | "DELETE";

export interface AuditFieldDiff {
  field: string;
  before: string;
  after: string;
}

export interface AuditLogEntry {
  id: number;
  action: AuditAction;
  tableName: string;
  rowId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  at: string;
  summary: string;
  diffs: AuditFieldDiff[];
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export const AUDIT_TABLES: { value: string; label: string }[] = [
  { value: "students", label: "Students" },
  { value: "enrollments", label: "Class Enrollments" },
  { value: "scores", label: "Assessment Scores" },
  { value: "term_results", label: "Term Results" },
  { value: "bece_registrations", label: "BECE Registrations" },
  { value: "invoices", label: "Invoices" },
  { value: "invoice_items", label: "Invoice Items" },
  { value: "payments", label: "Fee Payments" },
  { value: "expenses", label: "Expenses & Approvals" },
  { value: "staff", label: "Staff Directory" },
  { value: "guardians", label: "Guardians" },
  { value: "user_roles", label: "User Roles & Access" },
];

const IGNORED_DIFF_KEYS = new Set(["updated_at", "created_at", "school_id"]);

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function computeDiffs(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): AuditFieldDiff[] {
  if (!before && !after) return [];
  const keys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const out: AuditFieldDiff[] = [];
  for (const key of keys) {
    if (IGNORED_DIFF_KEYS.has(key)) continue;
    const b = before ? before[key] : undefined;
    const a = after ? after[key] : undefined;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push({
        field: key,
        before: formatValue(b),
        after: formatValue(a),
      });
    }
  }
  return out;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function buildSummary(
  action: AuditAction,
  tableName: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  const row = (after ?? before ?? {}) as Record<string, unknown>;
  const verb =
    action === "INSERT"
      ? "Created"
      : action === "DELETE"
        ? "Deleted"
        : "Updated";

  switch (tableName) {
    case "students": {
      const name = [str(row.first_name), str(row.last_name)]
        .filter(Boolean)
        .join(" ");
      const adm = str(row.admission_no);
      return `${verb} student ${name || "record"}${adm ? ` (${adm})` : ""}`;
    }
    case "staff":
      return `${verb} staff member ${str(row.full_name) || "record"} (${str(row.staff_no) || "—"})`;
    case "invoices":
      return `${verb} invoice ${str(row.number) || "record"} (status: ${str(row.status) || "—"})`;
    case "invoice_items":
      return `${verb} invoice line item "${str(row.description) || "item"}" (GHS ${String(row.amount ?? "0")})`;
    case "payments":
      return `${verb} fee payment receipt ${str(row.receipt_no) || ""} of GHS ${String(row.amount ?? "0")} (${str(row.method) || "cash"})`;
    case "expenses":
      return `${verb} expense voucher ${str(row.voucher_no) || ""} "${str(row.title) || ""}" — GHS ${String(row.amount ?? "0")} [${str(row.status) || "pending"}]`;
    case "scores":
      return `${verb} assessment score (${String(row.score ?? "—")} pts)`;
    case "term_results":
      return `${verb} terminal result (total: ${String(row.total ?? "—")}%, grade: ${str(row.grade) || "—"})`;
    case "bece_registrations":
      return `${verb} BECE candidate registration (${str(row.index_number) || "No index #"}, ${String(row.exam_year ?? "")})`;
    case "user_roles":
      return `${verb} role assignment "${str(row.role) || "role"}"`;
    case "enrollments":
      return `${verb} class enrollment (status: ${str(row.status) || "enrolled"})`;
    case "guardians":
      return `${verb} guardian ${str(row.full_name) || "record"}`;
    default:
      return `${verb} ${tableName} record`;
  }
}

export async function listAuditLogs(options?: {
  tableName?: string;
  action?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> {
  const limit = options?.limit ?? 200;
  let query = supabase
    .from("audit_log")
    .select("id, action, table_name, row_id, actor_id, at, before, after")
    .order("at", { ascending: false })
    .limit(limit);

  if (options?.tableName && options.tableName !== "all") {
    query = query.eq("table_name", options.tableName);
  }
  if (options?.action && options.action !== "all") {
    query = query.eq("action", options.action);
  }

  const { data, error } = await query;
  if (error) throw error;

  type RawAuditRow = {
    id: number;
    action: AuditAction;
    table_name: string;
    row_id: string | null;
    actor_id: string | null;
    at: string;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
  };

  const rows = (data ?? []) as RawAuditRow[];
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id))),
  );

  const actors = new Map<string, { fullName: string; email: string | null }>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      actors.set(p.id, { fullName: p.full_name, email: p.email ?? null });
    }
  }

  return rows.map((r) => {
    const actor = r.actor_id ? actors.get(r.actor_id) : undefined;
    return {
      id: r.id,
      action: r.action,
      tableName: r.table_name,
      rowId: r.row_id,
      actorId: r.actor_id,
      actorName: actor?.fullName ?? null,
      actorEmail: actor?.email ?? null,
      at: r.at,
      summary: buildSummary(r.action, r.table_name, r.before, r.after),
      diffs: computeDiffs(r.before, r.after),
      before: r.before,
      after: r.after,
    };
  });
}

