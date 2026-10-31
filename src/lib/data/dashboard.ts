// Data layer for the overview screen. RLS scopes every count to what the
// signed-in role may see, so a teacher's numbers cover only their classes.
import { supabase } from "../supabase";

export interface DashboardStats {
  activeStudents: number;
  /** Students admitted since the first of this month. */
  admittedThisMonth: number;
  staff: number;
  teachingStaff: number;
  classes: number;
  /** Name of the current academic year, if one is set. */
  yearName: string | null;
  attendanceToday: { marked: number; present: number };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function today(): string {
  // Local calendar date, not UTC, so Accra mornings do not show yesterday.
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const day = today();
  const [activeStudents, admittedThisMonth, staff, teachingStaff, classes, marked, present, year] = await Promise.all([
    count(supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(supabase.from("students").select("id", { count: "exact", head: true }).gte("admitted_on", firstOfMonth())),
    count(supabase.from("staff").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(supabase.from("staff").select("id", { count: "exact", head: true }).eq("status", "active").eq("type", "teaching")),
    count(supabase.from("classes").select("id", { count: "exact", head: true })),
    count(supabase.from("attendance").select("id", { count: "exact", head: true }).eq("date", day)),
    count(
      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("date", day)
        .in("status", ["present", "late"]),
    ),
    supabase.from("academic_years").select("name").eq("is_current", true).maybeSingle(),
  ]);
  return {
    activeStudents, admittedThisMonth, staff, teachingStaff, classes,
    yearName: year.data?.name ?? null,
    attendanceToday: { marked, present },
  };
}

// ─── Recent activity ─────────────────────────────────────────────────────────
// Read from the audit log, which only administrators may read; everyone else
// simply gets an empty list.

export interface ActivityItem {
  id: number;
  text: string;
  actor: string | null;
  at: string;
}

type Row = {
  id: number;
  action: string;
  table_name: string;
  actor_id: string | null;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function describe(r: Row): string | null {
  const row = (r.after ?? r.before ?? {}) as Record<string, unknown>;
  const name = [str(row.first_name), str(row.last_name)].filter(Boolean).join(" ");
  const verb = r.action === "INSERT" ? "added" : r.action === "DELETE" ? "removed" : "updated";
  switch (r.table_name) {
    case "students":
      if (r.action === "INSERT") return `${name || "A student"} was admitted${row.admission_no ? ` (${str(row.admission_no)})` : ""}`;
      if (r.action === "DELETE") return `${name || "A student"} was deleted`;
      return r.before && r.after && r.before.status !== r.after.status
        ? `${name || "A student"} is now marked ${str(r.after.status)}`
        : `${name || "A student"}'s record was updated`;
    case "staff":
      return `${str(row.full_name) || "A staff member"} was ${verb}`;
    case "profiles":
      return r.action === "INSERT" ? `A login was created for ${str(row.full_name) || "a new user"}` : null;
    case "invoices":
      return r.action === "INSERT" ? `Invoice ${str(row.number)} was issued` : null;
    case "payments":
      return r.action === "INSERT" ? `A payment of GHS ${str(String(row.amount ?? ""))} was recorded (${str(row.receipt_no)})` : null;
    case "bece_registrations":
      return str(row.index_number) ? "A BECE index number was entered" : null;
    default:
      return null;
  }
}

export async function getRecentActivity(limit = 8): Promise<ActivityItem[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, action, table_name, actor_id, at, before, after")
    .order("at", { ascending: false })
    .limit(60);
  if (error) throw error;

  const picked: (Row & { text: string })[] = [];
  for (const r of (data ?? []) as Row[]) {
    // Skip throwaway data from the automated checks: accounts on the reserved
    // @example.test domain and records whose name starts with "ZZ".
    const row = (r.after ?? r.before ?? {}) as Record<string, unknown>;
    if (str(row.email).endsWith("@example.test")) continue;
    if ([row.first_name, row.last_name, row.full_name].some((n) => str(n).startsWith("ZZ"))) continue;
    const text = describe(r);
    if (text) picked.push({ ...r, text });
    if (picked.length >= limit) break;
  }

  const ids = [...new Set(picked.map((p) => p.actor_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of people ?? []) names.set(p.id, p.full_name);
  }
  return picked.map((p) => ({
    id: p.id, text: p.text, at: p.at, actor: p.actor_id ? (names.get(p.actor_id) ?? null) : null,
  }));
}
