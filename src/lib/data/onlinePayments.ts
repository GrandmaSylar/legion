// Online payment attempts, for the school office. Parents start and finish a payment on
// Paystack's page (see paystack.ts); this is where the office checks how those went and
// deals with anything that needs a person to look at it.
import { supabase } from "../supabase";

export type OnlinePaymentStatus = "pending" | "success" | "failed" | "abandoned" | "refunded";

export interface OnlinePaymentRow {
  id: string;
  reference: string;
  amount: number;
  status: OnlinePaymentStatus;
  channel: string | null;
  note: string | null;
  needsReview: boolean;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  paidAt: string | null;
  invoiceNumber: string;
  studentName: string;
  parentName: string | null;
  paymentId: string | null;
  receiptNo: string | null;
  receiptCancelled: boolean;
}

export async function listOnlinePayments(): Promise<OnlinePaymentRow[]> {
  const { data, error } = await supabase
    .from("online_payments")
    .select(
      `id, reference, amount, status, channel, note, needs_review, review_note, reviewed_at, created_at, paid_at, payment_id,
       invoices(number, students(first_name, last_name)),
       profiles!online_payments_initiated_by_fkey(full_name),
       payments(receipt_no, voided_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  return (data ?? []).map((r) => {
    const inv = Array.isArray(r.invoices) ? r.invoices[0] : r.invoices;
    const stu = inv ? (Array.isArray(inv.students) ? inv.students[0] : inv.students) : null;
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const pay = Array.isArray(r.payments) ? r.payments[0] : r.payments;
    return {
      id: r.id,
      reference: r.reference,
      amount: Number(r.amount),
      status: r.status as OnlinePaymentStatus,
      channel: r.channel,
      note: r.note,
      needsReview: r.needs_review,
      reviewNote: r.review_note,
      reviewedAt: r.reviewed_at,
      createdAt: r.created_at,
      paidAt: r.paid_at,
      invoiceNumber: inv?.number ?? "",
      studentName: stu ? [stu.first_name, stu.last_name].filter(Boolean).join(" ") : "",
      parentName: prof?.full_name ?? null,
      paymentId: r.payment_id,
      receiptNo: pay?.receipt_no ?? null,
      receiptCancelled: !!pay?.voided_at,
    };
  });
}

/** Records that someone looked into a flagged payment and what was done about it. */
export async function resolveOnlinePayment(id: string, note: string): Promise<void> {
  const { error } = await supabase.rpc("resolve_online_payment", { p_id: id, p_note: note });
  if (error) throw error;
}
