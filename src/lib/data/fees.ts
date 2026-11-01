import { supabase } from "../supabase";

export type InvoiceStatus = "unpaid" | "partial" | "paid" | "void";
export type InvoiceItemKind = "fee" | "discount" | "arrears";
export type PaymentMethod = "cash" | "mobile_money" | "bank_transfer";
export type MomoNetwork = "mtn" | "telecel" | "airteltigo";

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
      invoice_items(id, fee_category_id, kind, description, amount),
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
