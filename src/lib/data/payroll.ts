// Payroll. The database calculates every payslip, decides who may see or sign what, and keeps a signed run
// from changing; these calls ask. Money arrives as numbers.
import { supabase } from "../supabase";
import type { RunStatus } from "../payroll";

const num = (v: unknown) => Number(v ?? 0);

export type ProrateMethod = "none" | "calendar_days" | "working_days";

export interface PayrollConfig {
  requireSeparateApprover: boolean; currency: string; prorateMethod: ProrateMethod;
  rulesConfirmedBy: string | null; rulesConfirmedNote: string | null; rulesConfirmedAt: string | null; activeRules: number;
}

export async function getPayrollConfig(): Promise<PayrollConfig> {
  const { data, error } = await supabase.rpc("payroll_config");
  if (error) throw error;
  return data as PayrollConfig;
}

export async function savePayrollSettings(separate: boolean, currency: string): Promise<void> {
  const { error } = await supabase.rpc("save_payroll_settings", { p_separate: separate, p_currency: currency });
  if (error) throw error;
}

export async function savePayrollProration(method: ProrateMethod): Promise<void> {
  const { error } = await supabase.rpc("save_payroll_proration", { p_method: method });
  if (error) throw error;
}

// ─── A person's own payslips ─────────────────────────────────────────────────

export interface MyPayslip { id: string; year: number; month: number; basic: number; gross: number; deductions: number; net: number; paidAt: string | null }

export async function listMyPayslips(): Promise<MyPayslip[]> {
  const { data, error } = await supabase.rpc("my_payslips");
  if (error) throw error;
  return ((data ?? []) as { id: string; year: number; month: number; basic: string; gross: string; deductions: string; net: string; paid_at: string | null }[])
    .map((r) => ({ id: r.id, year: r.year, month: r.month, basic: num(r.basic), gross: num(r.gross), deductions: num(r.deductions), net: num(r.net), paidAt: r.paid_at }));
}

export interface SlipLine { kind: "earning" | "deduction" | "employer"; name: string; amount: number }

export async function getMyPayslipLines(slipId: string): Promise<SlipLine[]> {
  const { data, error } = await supabase.rpc("my_payslip_lines", { p_slip: slipId });
  if (error) throw error;
  return ((data ?? []) as { kind: SlipLine["kind"]; name: string; amount: string }[]).map((r) => ({ kind: r.kind, name: r.name, amount: num(r.amount) }));
}

// ─── Staff pay ───────────────────────────────────────────────────────────────

export interface PayStaff { staffId: string; name: string; staffNo: string | null; job: string | null; status: string; basic: number | null; effectiveFrom: string | null; hasAccount: boolean; hiredOn: string | null; leftOn: string | null }

export async function listPayStaff(): Promise<PayStaff[]> {
  const { data, error } = await supabase.rpc("payroll_staff_list");
  if (error) throw error;
  return ((data ?? []) as { staff_id: string; full_name: string; staff_no: string | null; job: string | null; status: string; basic: string | null; effective_from: string | null; has_account: boolean; hired_on: string | null; left_on: string | null }[])
    .map((r) => ({ staffId: r.staff_id, name: r.full_name, staffNo: r.staff_no, job: r.job, status: r.status, basic: r.basic === null ? null : num(r.basic), effectiveFrom: r.effective_from, hasAccount: r.has_account, hiredOn: r.hired_on, leftOn: r.left_on }));
}

export async function setStaffPayDates(staffId: string, hired: string, left: string): Promise<void> {
  const { error } = await supabase.rpc("set_staff_pay_dates", { p_staff: staffId, p_hired: hired || null, p_left: left || null });
  if (error) throw error;
}

export interface PayHistoryRow { id: string; effectiveFrom: string; basic: number; note: string | null }

export async function getPayHistory(staffId: string): Promise<PayHistoryRow[]> {
  const { data, error } = await supabase.rpc("staff_pay_history", { p_staff: staffId });
  if (error) throw error;
  return ((data ?? []) as { id: string; effective_from: string; basic: string; note: string | null }[]).map((r) => ({ id: r.id, effectiveFrom: r.effective_from, basic: num(r.basic), note: r.note }));
}

export async function saveStaffPay(staffId: string, from: string, basic: number, note: string): Promise<void> {
  const { error } = await supabase.rpc("save_staff_pay", { p_staff: staffId, p_from: from, p_basic: basic, p_note: note || null });
  if (error) throw error;
}

export interface PayAccount { bankName?: string; accountName?: string; accountNo?: string; ssnitNo?: string; tinNo?: string }

export async function getStaffAccount(staffId: string): Promise<PayAccount> {
  const { data, error } = await supabase.rpc("get_staff_account", { p_staff: staffId });
  if (error) throw error;
  return (data ?? {}) as PayAccount;
}

export async function saveStaffAccount(staffId: string, a: Required<PayAccount>): Promise<void> {
  const { error } = await supabase.rpc("save_staff_account", { p_staff: staffId, p_bank: a.bankName, p_account_name: a.accountName, p_account_no: a.accountNo, p_ssnit: a.ssnitNo, p_tin: a.tinNo });
  if (error) throw error;
}

// ─── Allowances and deductions ───────────────────────────────────────────────

export interface Component { id: string; name: string; kind: "earning" | "deduction"; calc: "fixed" | "percent_of_basic"; taxable: boolean; pensionable: boolean; active: boolean }

export async function listComponents(): Promise<Component[]> {
  const { data, error } = await supabase.from("pay_components").select("id, name, kind, calc, taxable, pensionable, active").order("kind").order("name");
  if (error) throw error;
  return (data ?? []) as Component[];
}

export async function saveComponent(c: Partial<Component> & { name: string; kind: Component["kind"]; calc: Component["calc"] }): Promise<void> {
  const row = { name: c.name.trim(), kind: c.kind, calc: c.calc, taxable: c.taxable ?? true, pensionable: c.pensionable ?? false, active: c.active ?? true };
  const res = c.id ? await supabase.from("pay_components").update(row).eq("id", c.id) : await supabase.from("pay_components").insert(row);
  if (res.error) throw res.error;
}

export async function deleteComponent(id: string): Promise<void> {
  const { error } = await supabase.from("pay_components").delete().eq("id", id);
  if (error) throw error;
}

export interface StaffComponent { id: string; componentId: string; name: string; kind: "earning" | "deduction"; calc: "fixed" | "percent_of_basic"; amount: number; effectiveFrom: string; effectiveTo: string | null }

export async function listStaffComponents(staffId: string): Promise<StaffComponent[]> {
  const { data, error } = await supabase.from("staff_components").select("id, component_id, amount, effective_from, effective_to, pay_components(name, kind, calc)").eq("staff_id", staffId).order("effective_from", { ascending: false });
  if (error) throw error;
  type Row = { id: string; component_id: string; amount: string; effective_from: string; effective_to: string | null; pay_components: { name: string; kind: StaffComponent["kind"]; calc: StaffComponent["calc"] } | { name: string; kind: StaffComponent["kind"]; calc: StaffComponent["calc"] }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const c = Array.isArray(r.pay_components) ? r.pay_components[0] : r.pay_components;
    return { id: r.id, componentId: r.component_id, name: c?.name ?? "", kind: c?.kind ?? "earning", calc: c?.calc ?? "fixed", amount: num(r.amount), effectiveFrom: r.effective_from, effectiveTo: r.effective_to };
  });
}

export async function addStaffComponent(staffId: string, componentId: string, amount: number, from: string, to: string): Promise<void> {
  const { error } = await supabase.from("staff_components").insert({ staff_id: staffId, component_id: componentId, amount, effective_from: from, effective_to: to || null });
  if (error) throw error;
}

export async function removeStaffComponent(id: string): Promise<void> {
  const { error } = await supabase.from("staff_components").delete().eq("id", id);
  if (error) throw error;
}

// ─── Approval steps ──────────────────────────────────────────────────────────

export interface ApprovalStep { id: string; position: number; label: string; approvers: string[] }

export async function listSteps(): Promise<ApprovalStep[]> {
  const { data, error } = await supabase.from("payroll_approval_steps").select("id, position, label, approvers").order("position");
  if (error) throw error;
  return (data ?? []) as ApprovalStep[];
}

export async function saveStep(s: { id?: string; position: number; label: string; approvers: string[] }): Promise<void> {
  const row = { position: s.position, label: s.label.trim(), approvers: s.approvers };
  const res = s.id ? await supabase.from("payroll_approval_steps").update(row).eq("id", s.id) : await supabase.from("payroll_approval_steps").insert(row);
  if (res.error) throw res.error;
}

export async function deleteStep(id: string): Promise<void> {
  const { error } = await supabase.from("payroll_approval_steps").delete().eq("id", id);
  if (error) throw error;
}

// ─── Pay runs ────────────────────────────────────────────────────────────────

export interface Run { id: string; year: number; month: number; status: RunStatus; createdAt: string; calculatedAt: string | null; approvedAt: string | null; paidAt: string | null; paidNote: string | null; calculatedBy: string | null }

interface RunRow { id: string; year: number; month: number; status: RunStatus; created_at: string; calculated_at: string | null; approved_at: string | null; paid_at: string | null; paid_note: string | null; calculated_by: string | null }

export async function listRuns(): Promise<Run[]> {
  const { data, error } = await supabase.from("payroll_runs").select("id, year, month, status, created_at, calculated_at, approved_at, paid_at, paid_note, calculated_by").order("year", { ascending: false }).order("month", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RunRow[]).map((r) => ({ id: r.id, year: r.year, month: r.month, status: r.status, createdAt: r.created_at, calculatedAt: r.calculated_at, approvedAt: r.approved_at, paidAt: r.paid_at, paidNote: r.paid_note, calculatedBy: r.calculated_by }));
}

export async function createRun(year: number, month: number): Promise<string> {
  const { data, error } = await supabase.rpc("create_payroll_run", { p_year: year, p_month: month });
  if (error) throw error;
  return data as string;
}

export async function calculateRun(id: string): Promise<{ slips: number; skipped: number }> {
  const { data, error } = await supabase.rpc("calculate_payroll_run", { p_run: id });
  if (error) throw error;
  return data as { slips: number; skipped: number };
}

export async function submitRun(id: string): Promise<void> {
  const { error } = await supabase.rpc("submit_payroll_run", { p_run: id });
  if (error) throw error;
}

export async function approveRun(id: string, comment: string): Promise<"approved" | "in_approval"> {
  const { data, error } = await supabase.rpc("approve_payroll_run", { p_run: id, p_comment: comment || null });
  if (error) throw error;
  return data as "approved" | "in_approval";
}

export async function rejectRun(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("reject_payroll_run", { p_run: id, p_reason: reason });
  if (error) throw error;
}

export async function markPaid(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("mark_payroll_paid", { p_run: id, p_note: note || null });
  if (error) throw error;
}

export async function cancelRun(id: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_payroll_run", { p_run: id, p_reason: reason || null });
  if (error) throw error;
}

export interface Slip { id: string; staffId: string; name: string; staffNo: string | null; job: string | null; basic: number; gross: number; deductions: number; net: number; employerCost: number }

export async function listSlips(runId: string): Promise<Slip[]> {
  const { data, error } = await supabase.from("payroll_slips").select("id, staff_id, staff_name, staff_no, job, basic, gross, deductions, net, employer_cost").eq("run_id", runId).order("staff_name");
  if (error) throw error;
  return ((data ?? []) as { id: string; staff_id: string; staff_name: string; staff_no: string | null; job: string | null; basic: string; gross: string; deductions: string; net: string; employer_cost: string }[])
    .map((r) => ({ id: r.id, staffId: r.staff_id, name: r.staff_name, staffNo: r.staff_no, job: r.job, basic: num(r.basic), gross: num(r.gross), deductions: num(r.deductions), net: num(r.net), employerCost: num(r.employer_cost) }));
}

export async function listSlipLines(slipId: string): Promise<SlipLine[]> {
  const { data, error } = await supabase.from("payroll_slip_lines").select("kind, name, amount, sort").eq("slip_id", slipId).order("sort");
  if (error) throw error;
  return ((data ?? []) as { kind: SlipLine["kind"]; name: string; amount: string }[]).map((r) => ({ kind: r.kind, name: r.name, amount: num(r.amount) }));
}

export interface Adjustment { id: string; staffId: string; name: string; kind: "earning" | "deduction"; amount: number; note: string | null }

export async function listAdjustments(runId: string): Promise<Adjustment[]> {
  const { data, error } = await supabase.from("payroll_adjustments").select("id, staff_id, name, kind, amount, note").eq("run_id", runId).order("name");
  if (error) throw error;
  return ((data ?? []) as { id: string; staff_id: string; name: string; kind: "earning" | "deduction"; amount: string; note: string | null }[])
    .map((r) => ({ id: r.id, staffId: r.staff_id, name: r.name, kind: r.kind, amount: num(r.amount), note: r.note }));
}

export async function addAdjustment(runId: string, staffId: string, name: string, kind: "earning" | "deduction", amount: number, note: string): Promise<void> {
  const { error } = await supabase.rpc("add_payroll_adjustment", { p_run: runId, p_staff: staffId, p_name: name, p_kind: kind, p_amount: amount, p_note: note || null });
  if (error) throw error;
}

export async function removeAdjustment(id: string): Promise<void> {
  const { error } = await supabase.rpc("remove_payroll_adjustment", { p_id: id });
  if (error) throw error;
}

export interface RunLogRow { actorName: string | null; action: string; detail: string | null; at: string }

export async function listRunLog(runId: string): Promise<RunLogRow[]> {
  const { data, error } = await supabase.rpc("payroll_run_history", { p_run: runId });
  if (error) throw error;
  return ((data ?? []) as { actor_name: string | null; action: string; detail: string | null; at: string }[]).map((r) => ({ actorName: r.actor_name, action: r.action, detail: r.detail, at: r.at }));
}

export interface Signature { stepLabel: string | null; signedBy: string | null; at: string; comment: string | null }

export async function listSignatures(runId: string): Promise<Signature[]> {
  const { data, error } = await supabase.rpc("payroll_run_signatures", { p_run: runId });
  if (error) throw error;
  return ((data ?? []) as { step_label: string | null; signed_by: string | null; at: string; comment: string | null }[]).map((r) => ({ stepLabel: r.step_label, signedBy: r.signed_by, at: r.at, comment: r.comment }));
}

/** People who can be named as approvers: those who hold the approve action. */
export async function listApproverChoices(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.rpc("payroll_approver_choices");
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string }[]).map((r) => ({ id: r.id, name: r.full_name }));
}

export interface BankRow { staffName: string; bankName: string | null; accountName: string | null; accountNo: string | null; net: number }

/** Who to pay and where, for a pay run. For those who may download payroll records. */
export async function getBankList(runId: string): Promise<BankRow[]> {
  const { data, error } = await supabase.rpc("payroll_bank_list", { p_run: runId });
  if (error) throw error;
  return ((data ?? []) as { staff_name: string; bank_name: string | null; account_name: string | null; account_no: string | null; net: string }[])
    .map((r) => ({ staffName: r.staff_name, bankName: r.bank_name, accountName: r.account_name, accountNo: r.account_no, net: num(r.net) }));
}

// ─── Statutory rules ─────────────────────────────────────────────────────────

export type RuleKind = "deduction" | "employer";
export type RuleMethod = "percent" | "fixed" | "bands";
export type RuleBase = "basic" | "gross" | "pensionable" | "taxable";
export type RuleAppliesTo = "all" | "teaching" | "non_teaching";

export interface Band { from: number; to: number | null; rate: number }

export interface Rule {
  id: string; name: string; kind: RuleKind; method: RuleMethod; base: RuleBase; rate: number | null; fixedAmount: number | null; capBase: number | null;
  reducesTaxable: boolean; sequence: number; appliesTo: RuleAppliesTo; effectiveFrom: string; effectiveTo: string | null; active: boolean; bands: Band[];
}

export async function listRules(): Promise<Rule[]> {
  const [rules, bands] = await Promise.all([
    supabase.from("payroll_rules").select("id, name, kind, method, base, rate, fixed_amount, cap_base, reduces_taxable, sequence, applies_to, effective_from, effective_to, active").order("sequence").order("name").order("effective_from"),
    supabase.from("payroll_rule_bands").select("rule_id, from_amount, to_amount, rate").order("from_amount"),
  ]);
  if (rules.error) throw rules.error;
  if (bands.error) throw bands.error;
  const byRule = new Map<string, Band[]>();
  for (const b of (bands.data ?? []) as { rule_id: string; from_amount: string; to_amount: string | null; rate: string }[]) {
    byRule.set(b.rule_id, [...(byRule.get(b.rule_id) ?? []), { from: num(b.from_amount), to: b.to_amount === null ? null : num(b.to_amount), rate: num(b.rate) }]);
  }
  return ((rules.data ?? []) as { id: string; name: string; kind: RuleKind; method: RuleMethod; base: RuleBase; rate: string | null; fixed_amount: string | null; cap_base: string | null;
    reduces_taxable: boolean; sequence: number; applies_to: RuleAppliesTo; effective_from: string; effective_to: string | null; active: boolean }[])
    .map((r) => ({ id: r.id, name: r.name, kind: r.kind, method: r.method, base: r.base, rate: r.rate === null ? null : num(r.rate), fixedAmount: r.fixed_amount === null ? null : num(r.fixed_amount),
      capBase: r.cap_base === null ? null : num(r.cap_base), reducesTaxable: r.reduces_taxable, sequence: r.sequence, appliesTo: r.applies_to, effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to, active: r.active, bands: byRule.get(r.id) ?? [] }));
}

export interface RuleInput {
  id?: string; name: string; kind: RuleKind; method: RuleMethod; base: RuleBase; rate: number | null; fixedAmount: number | null; capBase: number | null;
  reducesTaxable: boolean; sequence: number; appliesTo: RuleAppliesTo; effectiveFrom: string; effectiveTo: string | null; active: boolean; bands: Band[];
}

export async function saveRule(r: RuleInput): Promise<void> {
  const { error } = await supabase.rpc("save_payroll_rule", {
    p_id: r.id ?? null, p_name: r.name, p_kind: r.kind, p_method: r.method, p_base: r.base, p_rate: r.rate, p_fixed: r.fixedAmount, p_cap: r.capBase,
    p_reduces_taxable: r.reducesTaxable, p_sequence: r.sequence, p_applies_to: r.appliesTo, p_from: r.effectiveFrom, p_to: r.effectiveTo, p_active: r.active,
    p_bands: r.method === "bands" ? r.bands : null,
  });
  if (error) throw error;
}

export async function newRuleVersion(id: string, from: string, rate: number | null, fixed: number | null, bands: Band[] | null): Promise<void> {
  const { error } = await supabase.rpc("new_payroll_rule_version", { p_id: id, p_from: from, p_rate: rate, p_fixed: fixed, p_bands: bands });
  if (error) throw error;
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_payroll_rule", { p_id: id });
  if (error) throw error;
}

export async function confirmRules(name: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_payroll_rules", { p_name: name, p_note: note || null });
  if (error) throw error;
}

export async function listExemptions(staffId: string): Promise<string[]> {
  const { data, error } = await supabase.from("staff_rule_exemptions").select("rule_id").eq("staff_id", staffId);
  if (error) throw error;
  return ((data ?? []) as { rule_id: string }[]).map((r) => r.rule_id);
}

export async function setExemption(staffId: string, ruleId: string, exempt: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_rule_exemption", { p_staff: staffId, p_rule: ruleId, p_exempt: exempt });
  if (error) throw error;
}
