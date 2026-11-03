// Compares what Paystack says it received with what Legion has recorded, for a period.
// Pure logic (no network, no database) so it can be tested on its own.
//
// Amounts in a Paystack transaction are in pesewas; Legion's are in cedis.

export interface PaystackTxn {
  reference: string;
  amount: number; // pesewas
  fees?: number | null; // pesewas, when Paystack reports it
  channel?: string | null;
  paid_at?: string | null;
}

export interface LegionAttempt {
  reference: string;
  amount: number; // cedis
  status: "pending" | "success" | "failed" | "abandoned" | "refunded";
  paid_at: string | null;
  receipt_no?: string | null;
}

export interface ReconcileResult {
  paystack: { count: number; total: number; fees: number | null; net: number | null };
  legion: { count: number; total: number };
  matched: number;
  /** Paystack took the money, but Legion has no receipt for it. */
  paidNotRecorded: { reference: string; amount: number; paidAt: string | null; channel: string | null }[];
  /** Paystack took money Legion never asked for (another use of the same Paystack account). */
  notFromLegion: { reference: string; amount: number; paidAt: string | null; channel: string | null }[];
  /** Legion has a receipt, Paystack has no such payment. */
  recordedNotInPaystack: { reference: string; amount: number; paidAt: string | null; receiptNo: string | null }[];
  /** Both have it, for different amounts. */
  amountMismatch: { reference: string; paystackAmount: number; legionAmount: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * @param paystack successful transactions in the period, from Paystack
 * @param ours Legion's online payment attempts around the period
 * @param inPeriod decides whether a Legion receipt falls inside the period being checked
 * @param complete false when Paystack's list was cut short, so a missing payment cannot be trusted
 */
export function reconcile(
  paystack: PaystackTxn[],
  ours: LegionAttempt[],
  inPeriod: (paidAt: string | null) => boolean,
  complete = true,
): ReconcileResult {
  const byRef = new Map(ours.map((o) => [o.reference, o]));
  const seen = new Set<string>();

  const result: ReconcileResult = {
    paystack: { count: 0, total: 0, fees: null, net: null },
    legion: { count: 0, total: 0 },
    matched: 0,
    paidNotRecorded: [],
    notFromLegion: [],
    recordedNotInPaystack: [],
    amountMismatch: [],
  };

  let fees = 0;
  let anyFees = false;
  for (const t of paystack) {
    if (seen.has(t.reference)) continue; // a repeated row must not be counted twice
    seen.add(t.reference);
    const amount = round2(t.amount / 100);
    result.paystack.count++;
    result.paystack.total = round2(result.paystack.total + amount);
    if (typeof t.fees === "number") {
      fees += t.fees / 100;
      anyFees = true;
    }
    const mine = byRef.get(t.reference);
    const info = { reference: t.reference, amount, paidAt: t.paid_at ?? null, channel: t.channel ?? null };
    if (!mine) {
      result.notFromLegion.push(info);
    } else if (mine.status === "success" || mine.status === "refunded") {
      if (round2(mine.amount) !== amount) {
        result.amountMismatch.push({ reference: t.reference, paystackAmount: amount, legionAmount: round2(mine.amount) });
      } else {
        result.matched++;
      }
    } else {
      result.paidNotRecorded.push(info);
    }
  }
  if (anyFees) {
    result.paystack.fees = round2(fees);
    result.paystack.net = round2(result.paystack.total - fees);
  }

  for (const o of ours) {
    if (o.status !== "success" || !inPeriod(o.paid_at)) continue;
    result.legion.count++;
    result.legion.total = round2(result.legion.total + o.amount);
    if (complete && !seen.has(o.reference)) {
      result.recordedNotInPaystack.push({ reference: o.reference, amount: round2(o.amount), paidAt: o.paid_at, receiptNo: o.receipt_no ?? null });
    }
  }
  return result;
}
