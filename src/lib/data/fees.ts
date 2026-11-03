import { supabase } from "../supabase";

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "void";
export type InvoiceItemKind = "fee" | "discount" | "arrears";
export type PaymentMethod = "cash" | "mobile_money" | "bank_transfer" | "card";
export type MomoNetwork = "mtn" | "telecel" | "airteltigo";
export type DiscountType = "percent" | "fixed";

export interface FeeCategory {
  id: string;
  name: string;
  isOneOff: boolean;
  isActive: boolean;
}

export interface FeeStructureRow {
  id: string;
  feeCategoryId: string;
  categoryName: string;
  levelId: string;
  levelName: string;
  termId: string | null;
  termName: string | null;
  amount: number;
}

export interface DiscountRow {
  id: string;
  name: string;
  type: DiscountType;
  value: number;
  appliesToCategoryId: string | null;
  appliesToCategoryName: string | null;
  reason: string | null;
  isActive: boolean;
}

export interface StudentDiscountRow {
  id: string;
  studentId: string;
  studentAdmissionNo: string;
  studentName: string;
  discountId: string;
  discountName: string;
  discountType: DiscountType;
  discountValue: number;
  academicYearId: string;
  academicYearName: string;
}

export interface InstallmentRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  studentId: string;
  studentAdmissionNo: string;
  studentName: string;
  dueOn: string;
  amount: number;
  invoiceBalance: number;
  invoiceStatus: InvoiceStatus;
}

export interface InvoiceItemRow {
  id: string;
  feeCategoryId: string | null;
  kind: InvoiceItemKind;
  description: string;
  amount: number;
}

export interface PaymentSummaryRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  receiptNo: string;
  amount: number;
  method: PaymentMethod;
  network: MomoNetwork | null;
  reference: string | null;
  paidOn: string;
  receivedByName: string | null;
  voidedAt: string | null;
  createdAt: string;
  studentId: string;
  studentAdmissionNo: string;
  studentName: string;
  termName: string | null;
  invoiceTotal: number;
  invoicePaidTotal: number;
  invoiceBalance: number;
  invoiceItems: InvoiceItemRow[];
}

export interface InvoiceRow {
  id: string;
  number: string;
  studentId: string;
  studentAdmissionNo: string;
  studentName: string;
  termId: string | null;
  termName: string | null;
  issuedOn: string;
  dueOn: string | null;
  status: InvoiceStatus;
  items: InvoiceItemRow[];
  installments: {
    id: string;
    dueOn: string;
    amount: number;
  }[];
  payments: {
    id: string;
    receiptNo: string;
    amount: number;
    method: PaymentMethod;
    network: MomoNetwork | null;
    reference: string | null;
    paidOn: string;
    receivedByName: string | null;
    voidedAt: string | null;
  }[];
  totalAmount: number;
  paidAmount: number;
  balance: number;
}

function fullName(
  s: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
  } | null,
): string {
  if (!s) return "Unknown Student";
  return [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
}

// ─── Fee Categories & Structures ─────────────────────────────────────────────

export async function listFeeCategories(): Promise<FeeCategory[]> {
  const { data, error } = await supabase
    .from("fee_categories")
    .select("id, name, is_one_off, is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    isOneOff: r.is_one_off,
    isActive: r.is_active,
  }));
}

export async function createFeeCategory(input: {
  name: string;
  isOneOff: boolean;
}): Promise<void> {
  const { error } = await supabase.from("fee_categories").insert({
    name: input.name.trim(),
    is_one_off: input.isOneOff,
    is_active: true,
  });
  if (error) throw error;
}

export async function listFeeStructures(): Promise<FeeStructureRow[]> {
  const { data, error } = await supabase
    .from("fee_structures")
    .select(
      "id, fee_category_id, level_id, term_id, amount, fee_categories(name), levels(name), terms(name)",
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const cat = Array.isArray(r.fee_categories)
      ? r.fee_categories[0]
      : r.fee_categories;
    const lvl = Array.isArray(r.levels) ? r.levels[0] : r.levels;
    const trm = Array.isArray(r.terms) ? r.terms[0] : r.terms;
    return {
      id: r.id,
      feeCategoryId: r.fee_category_id,
      categoryName: (cat as { name?: string } | null)?.name ?? "Category",
      levelId: r.level_id,
      levelName: (lvl as { name?: string } | null)?.name ?? "Level",
      termId: r.term_id,
      termName: (trm as { name?: string } | null)?.name ?? null,
      amount: Number(r.amount),
    };
  });
}

export async function createFeeStructure(input: {
  feeCategoryId: string;
  levelId: string;
  termId: string | null;
  amount: number;
}): Promise<void> {
  const { error } = await supabase.from("fee_structures").insert({
    fee_category_id: input.feeCategoryId,
    level_id: input.levelId,
    term_id: input.termId || null,
    amount: input.amount,
  });
  if (error) throw error;
}

export async function deleteFeeStructure(id: string): Promise<void> {
  const { error } = await supabase.from("fee_structures").delete().eq("id", id);
  if (error) throw error;
}

// ─── Scholarships & Discounts ────────────────────────────────────────────────

export async function listDiscounts(): Promise<DiscountRow[]> {
  const { data, error } = await supabase
    .from("discounts")
    .select(
      "id, name, type, value, applies_to_category_id, reason, is_active, fee_categories(name)",
    )
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => {
    const cat = Array.isArray(r.fee_categories)
      ? r.fee_categories[0]
      : r.fee_categories;
    return {
      id: r.id,
      name: r.name,
      type: r.type as DiscountType,
      value: Number(r.value),
      appliesToCategoryId: r.applies_to_category_id,
      appliesToCategoryName: (cat as { name?: string } | null)?.name ?? null,
      reason: r.reason,
      isActive: r.is_active,
    };
  });
}

export async function createDiscount(input: {
  name: string;
  type: DiscountType;
  value: number;
  appliesToCategoryId: string | null;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.from("discounts").insert({
    name: input.name.trim(),
    type: input.type,
    value: input.value,
    applies_to_category_id: input.appliesToCategoryId || null,
    reason: input.reason?.trim() || null,
    is_active: true,
  });
  if (error) throw error;
}

export async function deleteDiscount(id: string): Promise<void> {
  const { error } = await supabase.from("discounts").delete().eq("id", id);
  if (error) throw error;
}

export async function listStudentDiscounts(
  academicYearId?: string | null,
): Promise<StudentDiscountRow[]> {
  let q = supabase
    .from("student_discounts")
    .select(
      "id, student_id, discount_id, academic_year_id, students(admission_no, first_name, middle_name, last_name), discounts(name, type, value), academic_years(name)",
    )
    .order("created_at", { ascending: false });

  if (academicYearId) {
    q = q.eq("academic_year_id", academicYearId);
  }

  const { data, error } = await q;
  if (error) throw error;

  return (data ?? []).map((r) => {
    const stu = Array.isArray(r.students) ? r.students[0] : r.students;
    const disc = Array.isArray(r.discounts) ? r.discounts[0] : r.discounts;
    const yr = Array.isArray(r.academic_years)
      ? r.academic_years[0]
      : r.academic_years;
    return {
      id: r.id,
      studentId: r.student_id,
      studentAdmissionNo:
        (stu as { admission_no?: string } | null)?.admission_no ?? "—",
      studentName: fullName(
        stu as {
          first_name?: string;
          middle_name?: string;
          last_name?: string;
        } | null,
      ),
      discountId: r.discount_id,
      discountName: (disc as { name?: string } | null)?.name ?? "Discount",
      discountType:
        ((disc as { type?: string } | null)?.type as DiscountType) ?? "percent",
      discountValue: Number((disc as { value?: number } | null)?.value ?? 0),
      academicYearId: r.academic_year_id,
      academicYearName: (yr as { name?: string } | null)?.name ?? "",
    };
  });
}

export async function assignStudentDiscount(input: {
  studentId: string;
  discountId: string;
  academicYearId: string;
}): Promise<void> {
  const { error } = await supabase.from("student_discounts").insert({
    student_id: input.studentId,
    discount_id: input.discountId,
    academic_year_id: input.academicYearId,
  });
  if (error) throw error;
}

export async function removeStudentDiscount(id: string): Promise<void> {
  const { error } = await supabase
    .from("student_discounts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// ─── Batch Term Billing ──────────────────────────────────────────────────────

export async function batchGenerateTermInvoices(input: {
  termId: string;
  classId?: string | null;
  dueOn?: string | null;
  includeOneOff?: boolean;
}): Promise<{
  invoicesCreated: number;
  studentsSkipped: number;
  totalBilled: number;
}> {
  const { data, error } = await supabase.rpc("batch_generate_term_invoices", {
    p_term_id: input.termId,
    p_class_id: input.classId || null,
    p_due_on: input.dueOn || null,
    p_include_one_off: Boolean(input.includeOneOff),
  });
  if (error) throw error;
  const row = (
    data as {
      invoices_created: number;
      students_skipped: number;
      total_billed: number;
    }[]
  )?.[0];
  return {
    invoicesCreated: Number(row?.invoices_created ?? 0),
    studentsSkipped: Number(row?.students_skipped ?? 0),
    totalBilled: Number(row?.total_billed ?? 0),
  };
}

// ─── Installment Plans ───────────────────────────────────────────────────────

export async function createInstallments(input: {
  invoiceId: string;
  items: { dueOn: string; amount: number }[];
}): Promise<void> {
  const rows = input.items
    .filter((i) => i.dueOn && i.amount > 0)
    .map((i) => ({
      invoice_id: input.invoiceId,
      due_on: i.dueOn,
      amount: i.amount,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("installments").insert(rows);
  if (error) throw error;
}

export async function deleteInstallment(id: string): Promise<void> {
  const { error } = await supabase.from("installments").delete().eq("id", id);
  if (error) throw error;
}

export function extractInstallmentsFromInvoices(
  invoices: InvoiceRow[],
): InstallmentRow[] {
  const rows: InstallmentRow[] = [];
  for (const inv of invoices) {
    for (const inst of inv.installments) {
      rows.push({
        id: inst.id,
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        studentId: inv.studentId,
        studentAdmissionNo: inv.studentAdmissionNo,
        studentName: inv.studentName,
        dueOn: inst.dueOn,
        amount: inst.amount,
        invoiceBalance: inv.balance,
        invoiceStatus: inv.status,
      });
    }
  }
  return rows.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

// ─── Invoices & Payments ─────────────────────────────────────────────────────

export async function listInvoices(): Promise<InvoiceRow[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      id,
      number,
      student_id,
      term_id,
      issued_on,
      due_on,
      status,
      students(id, admission_no, first_name, middle_name, last_name),
      terms(name),
      invoice_items!invoice_items_invoice_id_fkey(id, fee_category_id, kind, description, amount),
      installments(id, due_on, amount),
      payments(id, receipt_no, amount, method, network, reference, paid_on, received_by_name, voided_at)
    `,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((inv) => {
    const stu = Array.isArray(inv.students) ? inv.students[0] : inv.students;
    const trm = Array.isArray(inv.terms) ? inv.terms[0] : inv.terms;
    const items: InvoiceItemRow[] = (inv.invoice_items ?? []).map((it) => ({
      id: it.id,
      feeCategoryId: it.fee_category_id,
      kind: it.kind as InvoiceItemKind,
      description: it.description,
      amount: Number(it.amount),
    }));
    const installments = (inv.installments ?? []).map((inst) => ({
      id: inst.id,
      dueOn: inst.due_on,
      amount: Number(inst.amount),
    }));
    const payments = (inv.payments ?? []).map((p) => ({
      id: p.id,
      receiptNo: p.receipt_no,
      amount: Number(p.amount),
      method: p.method as PaymentMethod,
      network: (p.network as MomoNetwork | null) ?? null,
      reference: p.reference ?? null,
      paidOn: p.paid_on,
      receivedByName: p.received_by_name ?? null,
      voidedAt: p.voided_at ?? null,
    }));

    const totalAmount = items.reduce((sum, it) => sum + it.amount, 0);
    const paidAmount = payments
      .filter((p) => !p.voidedAt)
      .reduce((sum, p) => sum + p.amount, 0);
    const balance = Math.max(0, totalAmount - paidAmount);

    return {
      id: inv.id,
      number: inv.number,
      studentId: inv.student_id,
      studentAdmissionNo:
        (stu as { admission_no?: string } | null)?.admission_no ?? "—",
      studentName: fullName(
        stu as {
          first_name?: string;
          middle_name?: string;
          last_name?: string;
        } | null,
      ),
      termId: inv.term_id,
      termName: (trm as { name?: string } | null)?.name ?? null,
      issuedOn: inv.issued_on,
      dueOn: inv.due_on,
      status: inv.status as InvoiceStatus,
      items,
      installments,
      payments,
      totalAmount,
      paidAmount,
      balance,
    };
  });
}

export async function createStudentInvoice(input: {
  studentId: string;
  termId: string | null;
  dueOn: string | null;
  items: {
    feeCategoryId?: string | null;
    kind: InvoiceItemKind;
    description: string;
    amount: number;
  }[];
}): Promise<string> {
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      student_id: input.studentId,
      term_id: input.termId || null,
      number: "", // Trigger invoices_assign_number issues INV/YYYY/NNNNNN
      due_on: input.dueOn || null,
    })
    .select("id")
    .single();

  if (invErr) throw invErr;

  const itemRows = input.items
    .filter((it) => it.description.trim() && it.amount !== 0)
    .map((it) => ({
      invoice_id: inv.id,
      fee_category_id: it.feeCategoryId || null,
      kind: it.kind,
      description: it.description.trim(),
      amount:
        it.kind === "discount" ? -Math.abs(it.amount) : Math.abs(it.amount),
    }));

  if (itemRows.length > 0) {
    const { error: itemErr } = await supabase
      .from("invoice_items")
      .insert(itemRows);
    if (itemErr) throw itemErr;
  }

  return inv.id;
}

export async function recordPayment(input: {
  invoiceId: string;
  amount: number;
  method: PaymentMethod;
  network?: MomoNetwork | null;
  reference?: string;
  paidOn?: string;
}): Promise<{ id: string; receiptNo: string }> {
  const { data, error } = await supabase
    .from("payments")
    .insert({
      invoice_id: input.invoiceId,
      receipt_no: "", // Trigger payments_assign_receipt issues RCT/YYYY/NNNNNN
      amount: input.amount,
      method: input.method,
      network:
        input.method === "mobile_money" ? (input.network ?? "mtn") : null,
      reference: input.reference?.trim() || null,
      paid_on: input.paidOn || new Date().toISOString().slice(0, 10),
    })
    .select("id, receipt_no")
    .single();

  if (error) throw error;
  return { id: data.id, receiptNo: data.receipt_no };
}

export function extractPaymentsFromInvoices(
  invoices: InvoiceRow[],
): PaymentSummaryRow[] {
  const rows: PaymentSummaryRow[] = [];
  for (const inv of invoices) {
    for (const p of inv.payments) {
      rows.push({
        id: p.id,
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        receiptNo: p.receiptNo,
        amount: p.amount,
        method: p.method,
        network: p.network,
        reference: p.reference,
        paidOn: p.paidOn,
        receivedByName: p.receivedByName,
        voidedAt: p.voidedAt,
        createdAt: p.paidOn,
        studentId: inv.studentId,
        studentAdmissionNo: inv.studentAdmissionNo,
        studentName: inv.studentName,
        termName: inv.termName,
        invoiceTotal: inv.totalAmount,
        invoicePaidTotal: inv.paidAmount,
        invoiceBalance: inv.balance,
        invoiceItems: inv.items,
      });
    }
  }
  return rows.sort((a, b) => b.receiptNo.localeCompare(a.receiptNo));
}

// ─── Expense Tracking & Approval Workflow ────────────────────────────────────

export type ExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export interface ExpenseCategoryRow {
  id: string;
  name: string;
  budgetLimit: number | null;
  isActive: boolean;
}

export interface ExpenseRow {
  id: string;
  voucherNo: string;
  expenseCategoryId: string;
  categoryName: string;
  termId: string | null;
  termName: string | null;
  title: string;
  vendor: string | null;
  amount: number;
  incurredOn: string;
  paymentMethod: PaymentMethod;
  reference: string | null;
  notes: string | null;
  receiptUrl: string | null;
  status: ExpenseStatus;
  requestedByName: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  paidAt: string | null;
  createdAt: string;
}

export async function listExpenseCategories(): Promise<ExpenseCategoryRow[]> {
  const { data, error } = await supabase
    .from("expense_categories")
    .select("id, name, budget_limit, is_active")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    budgetLimit: r.budget_limit !== null ? Number(r.budget_limit) : null,
    isActive: r.is_active,
  }));
}

export async function createExpenseCategory(input: {
  name: string;
  budgetLimit: number | null;
}): Promise<void> {
  const { error } = await supabase.from("expense_categories").insert({
    name: input.name.trim(),
    budget_limit: input.budgetLimit,
    is_active: true,
  });
  if (error) throw error;
}

export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await supabase
    .from("expense_categories")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function listExpenses(): Promise<ExpenseRow[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select(
      "id, voucher_no, expense_category_id, term_id, title, vendor, amount, incurred_on, payment_method, reference, notes, receipt_url, status, requested_by_name, reviewed_by_name, reviewed_at, review_note, paid_at, created_at, expense_categories(name), terms(name)",
    )
    .order("incurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r) => {
    const cat = Array.isArray(r.expense_categories)
      ? r.expense_categories[0]
      : r.expense_categories;
    const trm = Array.isArray(r.terms) ? r.terms[0] : r.terms;
    return {
      id: r.id,
      voucherNo: r.voucher_no,
      expenseCategoryId: r.expense_category_id,
      categoryName: (cat as { name?: string } | null)?.name ?? "Category",
      termId: r.term_id,
      termName: (trm as { name?: string } | null)?.name ?? null,
      title: r.title,
      vendor: r.vendor,
      amount: Number(r.amount),
      incurredOn: r.incurred_on,
      paymentMethod: r.payment_method as PaymentMethod,
      reference: r.reference,
      notes: r.notes,
      receiptUrl: r.receipt_url,
      status: r.status as ExpenseStatus,
      requestedByName: r.requested_by_name,
      reviewedByName: r.reviewed_by_name,
      reviewedAt: r.reviewed_at,
      reviewNote: r.review_note,
      paidAt: r.paid_at,
      createdAt: r.created_at,
    };
  });
}

export async function createExpense(input: {
  expenseCategoryId: string;
  termId: string | null;
  title: string;
  vendor?: string;
  amount: number;
  incurredOn: string;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  receiptUrl?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("expenses").insert({
    expense_category_id: input.expenseCategoryId,
    term_id: input.termId || null,
    voucher_no: "", // Trigger expenses_before_insert assigns EXP-YYYY-NNNN
    title: input.title.trim(),
    vendor: input.vendor?.trim() || null,
    amount: input.amount,
    incurred_on: input.incurredOn,
    payment_method: input.paymentMethod,
    reference: input.reference?.trim() || null,
    notes: input.notes?.trim() || null,
    receipt_url: input.receiptUrl || null,
  });
  if (error) throw error;
}

export async function reviewExpense(input: {
  expenseId: string;
  decision: ExpenseStatus;
  reviewNote?: string;
}): Promise<void> {
  const { error } = await supabase.rpc("review_expense", {
    p_expense_id: input.expenseId,
    p_decision: input.decision,
    p_review_note: input.reviewNote?.trim() || null,
  });
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
