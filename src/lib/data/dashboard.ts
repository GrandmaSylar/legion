// Data layer for the overview screen. RLS scopes every count to what the
// signed-in role may see, so a teacher's numbers cover only their classes.
import { supabase } from "../supabase";

export interface DashboardStats {
  activeStudents: number;
  staff: number;
  classes: number;
  attendanceToday: { marked: number; present: number };
}

function today(): string {
  // Local calendar date, not UTC, so Accra mornings do not show yesterday.
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count: n, error } = await query;
  if (error) throw error;
  return n ?? 0;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const day = today();
  const [activeStudents, staff, classes, marked, present] = await Promise.all([
    count(supabase.from("students").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(supabase.from("staff").select("id", { count: "exact", head: true }).eq("status", "active")),
    count(supabase.from("classes").select("id", { count: "exact", head: true })),
    count(supabase.from("attendance").select("id", { count: "exact", head: true }).eq("date", day)),
    count(
      supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .eq("date", day)
        .in("status", ["present", "late"]),
    ),
  ]);
  return { activeStudents, staff, classes, attendanceToday: { marked, present } };
}
