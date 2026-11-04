// Assessment schemes: how a school's marks add up to a term result. The database does the sums and
// enforces the rules (shares add up to 100, who may change a scheme); these calls read and save them.
import { supabase } from "../supabase";

export type PartFeeds = "ca" | "exam";
export type PartMethod = "average" | "best_n" | "total_marks";
export type PartMissing = "skip" | "zero";

export interface SchemePart {
  id: string;
  name: string;
  feeds: PartFeeds;
  weight: number;
  method: PartMethod;
  bestN: number | null;
  missing: PartMissing;
  /** The kind of exam (mock, mid_term, term_exam, other) this part is tied to, or null. */
  examKind: string | null;
}

export interface Scheme {
  id: string;
  name: string;
  description: string | null;
  parts: SchemePart[];
}

export const FEEDS_LABELS: Record<PartFeeds, string> = { ca: "Continuous assessment", exam: "Exam" };
export const METHOD_LABELS: Record<PartMethod, string> = {
  average: "Average of all marks", best_n: "Average of the best marks", total_marks: "All marks pooled",
};
export const MISSING_LABELS: Record<PartMissing, string> = { skip: "Leave it out", zero: "Count it as zero" };

/** One line saying how a part works, in words a teacher would use. */
export function describePart(p: Pick<SchemePart, "method" | "bestN" | "missing" | "feeds" | "weight">): string {
  const how = p.method === "average" ? "Average of all marks"
    : p.method === "best_n" ? `Average of the best ${p.bestN ?? "?"} ${p.bestN === 1 ? "mark" : "marks"}`
    : "All marks pooled";
  return `${how}. A missing mark: ${p.missing === "zero" ? "counts as zero" : "left out"}.`;
}

interface PartRow {
  id: string; scheme_id: string; name: string; feeds: string; weight: number | string; method: string; best_n: number | null; missing: string; sort: number; exam_kind: string | null;
}

const toPart = (r: PartRow): SchemePart => ({
  id: r.id, name: r.name, feeds: r.feeds as PartFeeds, weight: Number(r.weight), method: r.method as PartMethod,
  bestN: r.best_n, missing: r.missing as PartMissing, examKind: r.exam_kind,
});

export async function listSchemes(): Promise<Scheme[]> {
  const [s, c] = await Promise.all([
    supabase.from("assessment_schemes").select("id, name, description").order("name"),
    supabase.from("assessment_components").select("id, scheme_id, name, feeds, weight, method, best_n, missing, sort, exam_kind").order("sort"),
  ]);
  if (s.error) throw s.error;
  if (c.error) throw c.error;
  const parts = new Map<string, SchemePart[]>();
  for (const r of (c.data ?? []) as PartRow[]) parts.set(r.scheme_id, [...(parts.get(r.scheme_id) ?? []), toPart(r)]);
  return (s.data ?? []).map((r) => ({ id: r.id, name: r.name, description: r.description, parts: parts.get(r.id) ?? [] }));
}

export interface PartInput {
  /** Present for a part that already exists, so its assessments stay with it. */
  id?: string;
  name: string;
  feeds: PartFeeds;
  weight: number;
  method: PartMethod;
  bestN: number | null;
  missing: PartMissing;
}

export async function saveScheme(input: { id?: string; name: string; description: string; parts: PartInput[] }): Promise<string> {
  const { data, error } = await supabase.rpc("save_assessment_scheme", {
    p_id: input.id ?? null,
    p_name: input.name,
    p_description: input.description || null,
    p_components: input.parts.map((p) => ({
      id: p.id ?? null, name: p.name.trim(), feeds: p.feeds, weight: p.weight, method: p.method,
      bestN: p.method === "best_n" ? p.bestN : null, missing: p.missing,
    })),
  });
  if (error) throw error;
  return data as string;
}

export async function deleteScheme(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_assessment_scheme", { p_id: id });
  if (error) throw error;
}

export interface Assignments {
  levels: { id: string; name: string; order: number; schemeId: string | null }[];
  classes: { id: string; levelId: string; label: string; schemeId: string | null }[];
}

/** Which scheme each level uses, and any class that uses a different one (for the current academic year). */
export async function listAssignments(): Promise<Assignments> {
  const [lv, cl] = await Promise.all([
    supabase.from("levels").select("id, name, sort_order, assessment_scheme_id").order("sort_order"),
    supabase.from("classes").select("id, level_id, section, assessment_scheme_id, levels(name, sort_order), academic_years!inner(is_current)")
      .eq("academic_years.is_current", true),
  ]);
  if (lv.error) throw lv.error;
  if (cl.error) throw cl.error;
  return {
    levels: (lv.data ?? []).map((r) => ({ id: r.id, name: r.name, order: r.sort_order, schemeId: r.assessment_scheme_id })),
    classes: (cl.data ?? []).map((r) => {
      const lvl = (Array.isArray(r.levels) ? r.levels[0] : r.levels) as { name: string; sort_order: number } | null;
      return { id: r.id, levelId: r.level_id, label: `${lvl?.name ?? ""} ${r.section}`.trim(), schemeId: r.assessment_scheme_id };
    }).sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
  };
}

export async function setLevelScheme(levelId: string, schemeId: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_assessment_scheme", { p_level: levelId, p_class: null, p_scheme: schemeId });
  if (error) throw error;
}

export async function setClassScheme(classId: string, schemeId: string | null): Promise<void> {
  const { error } = await supabase.rpc("set_assessment_scheme", { p_level: null, p_class: classId, p_scheme: schemeId });
  if (error) throw error;
}

/** The scheme a class uses (its own, else its level's), or null when it counts marks the original way. */
export async function getClassScheme(classId: string): Promise<Scheme | null> {
  const { data, error } = await supabase.from("classes").select("assessment_scheme_id, levels(assessment_scheme_id)").eq("id", classId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const lvl = (Array.isArray(data.levels) ? data.levels[0] : data.levels) as { assessment_scheme_id: string | null } | null;
  const id = data.assessment_scheme_id ?? lvl?.assessment_scheme_id ?? null;
  if (!id) return null;
  const all = await listSchemes();
  return all.find((s) => s.id === id) ?? null;
}

// ─── Starting points ─────────────────────────────────────────────────────────

export interface Preset { key: string; label: string; hint: string; parts: Omit<PartInput, "id">[] }

const part = (name: string, feeds: PartFeeds, weight: number, method: PartMethod = "average", bestN: number | null = null, missing: PartMissing = "skip"): Omit<PartInput, "id"> =>
  ({ name, feeds, weight, method, bestN, missing });

export const PRESETS: Preset[] = [
  { key: "ges", label: "Ghana standard, 30 / 70", hint: "Class work 10, mid-term test 20, exam 70",
    parts: [part("Class work", "ca", 10), part("Mid-term test", "ca", 20), part("Exam", "exam", 70)] },
  { key: "40-60", label: "40 / 60", hint: "Class score 40, exam 60", parts: [part("Class score", "ca", 40), part("Exam", "exam", 60)] },
  { key: "50-50", label: "50 / 50", hint: "Class score 50, exam 50", parts: [part("Class score", "ca", 50), part("Exam", "exam", 50)] },
  { key: "best3", label: "Best three tests", hint: "Class work 10, best 3 tests 20, exam 70",
    parts: [part("Class work", "ca", 10), part("Tests", "ca", 20, "best_n", 3), part("Exam", "exam", 70)] },
  { key: "custom", label: "Start blank", hint: "Add your own parts", parts: [part("Class work", "ca", 50), part("Exam", "exam", 50)] },
];
