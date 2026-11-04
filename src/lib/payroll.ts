// Plain helpers for payroll: how money and months read, and what each status means. No imports, so it can be
// tested on its own. Nothing here calculates pay: the database does, so the answer is the same everywhere.

export type RunStatus = "draft" | "calculated" | "in_approval" | "approved" | "paid" | "cancelled";

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  draft: "Being prepared", calculated: "Calculated", in_approval: "Waiting for approval", approved: "Approved", paid: "Paid", cancelled: "Cancelled",
};

/** What the person looking at a run should do next, in words. */
export const RUN_STATUS_HELP: Record<RunStatus, string> = {
  draft: "Add any one-off adjustments, then calculate.",
  calculated: "Check the payslips, then send the pay run for approval.",
  in_approval: "Waiting for the people who sign it off.",
  approved: "Approved. Pay it, then mark it as paid to release the payslips.",
  paid: "Paid. Staff can read their payslips.",
  cancelled: "Cancelled.",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const monthName = (m: number) => MONTHS[m - 1] ?? "";
export const monthLabel = (year: number, month: number) => (monthName(month) ? `${monthName(month)} ${year}` : "");

/** "GHS 1,234.50". The amount comes from the database as a number or a numeric string. */
export function money(amount: number | string | null | undefined, currency = "GHS"): string {
  const n = Number(amount ?? 0);
  if (!Number.isFinite(n)) return `${currency} 0.00`;
  const sign = n < 0 ? "-" : "";
  return `${sign}${currency} ${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The amount typed into a box, as a number, or null when it is not a usable amount. */
export function parseAmount(raw: string): number | null {
  const t = raw.replace(/[,\s]/g, "");
  if (t === "" || !/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}

/** Last day of a month as YYYY-MM-DD. */
export function monthEnd(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

// ─── Describing a rule in words ──────────────────────────────────────────────

export interface RuleLike {
  kind: "deduction" | "employer"; method: "percent" | "fixed" | "bands"; base: "basic" | "gross" | "pensionable" | "taxable";
  rate: number | null; fixedAmount: number | null; capBase: number | null; reducesTaxable: boolean; appliesTo: "all" | "teaching" | "non_teaching";
  bands: { from: number; to: number | null; rate: number }[];
}

export const BASE_LABELS: Record<RuleLike["base"], string> = {
  basic: "basic pay", gross: "gross pay (basic plus all earnings)", pensionable: "pensionable pay (basic plus allowances marked pensionable)", taxable: "taxable pay (taxable earnings, less any deduction that reduces taxable pay)",
};

const trim = (n: number) => String(Number(n.toFixed(4)));
const amt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A rule as a sentence, so whoever enters it (and the accountant who checks it) can see exactly what it does. */
export function describeRule(r: RuleLike, currency = "GHS"): string {
  const base = BASE_LABELS[r.base];
  let how: string;
  if (r.method === "percent") how = `${trim(r.rate ?? 0)}% of ${base}`;
  else if (r.method === "fixed") how = `${currency} ${amt(r.fixedAmount ?? 0)} a month`;
  else how = `${base}, in slices: ${r.bands.map((b) => `${b.to === null ? `above ${amt(b.from)}` : `${amt(b.from)} to ${amt(b.to)}`} at ${trim(b.rate)}%`).join("; ")}`;
  const cap = r.capBase !== null && r.method !== "fixed" ? `, counting at most ${currency} ${amt(r.capBase)}` : "";
  const who = r.kind === "employer" ? "Paid by the school, not taken from the person" : "Taken from the person's pay";
  const tax = r.reducesTaxable ? "; reduces their taxable pay" : "";
  const people = r.appliesTo === "all" ? "" : r.appliesTo === "teaching" ? "; teaching staff only" : "; non-teaching staff only";
  return `${how}${cap}. ${who}${tax}${people}.`;
}
