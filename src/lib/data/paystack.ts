// Online fee payments. The browser only asks the paystack Edge Function to start a
// payment or to check one; it never holds the key and never records a payment.
import { invokeFunction } from "./functions";

export interface OnlinePaymentStatus {
  configured: boolean;
  mode: "test" | "live" | null;
}

export type OnlinePaymentResult =
  | { status: "success"; receiptNo: string | null }
  | { status: "pending" }
  | { status: "failed"; message?: string }
  | { status: "review"; message?: string };

export const getOnlinePaymentStatus = () =>
  invokeFunction<OnlinePaymentStatus>("paystack", { action: "status" });

/** Starts a payment and returns the Paystack page to send the parent to. */
export const startOnlinePayment = (invoiceId: string, amount: number) =>
  invokeFunction<{ authorizationUrl: string; reference: string; amount: number }>("paystack", {
    action: "initialize",
    invoiceId,
    amount,
    returnUrl: window.location.origin,
  });

/** Asks Paystack what became of a payment; records it if it succeeded. */
export const checkOnlinePayment = (reference: string) =>
  invokeFunction<OnlinePaymentResult>("paystack", { action: "verify", reference });

export interface PaymentLine { reference: string; amount: number; paidAt: string | null; channel: string | null }

export interface ReconcileReport {
  from: string;
  to: string;
  /** True when Paystack's list was too long to read in full, so "missing" results cannot be trusted. */
  truncated: boolean;
  paystack: { count: number; total: number; fees: number | null; net: number | null };
  legion: { count: number; total: number };
  matched: number;
  paidNotRecorded: PaymentLine[];
  notFromLegion: PaymentLine[];
  recordedNotInPaystack: { reference: string; amount: number; paidAt: string | null; receiptNo: string | null }[];
  amountMismatch: { reference: string; paystackAmount: number; legionAmount: number }[];
}

/** Compares Paystack's successful payments with Legion's online receipts for a period (admin or accountant). */
export const reconcileWithPaystack = (from: string, to: string) =>
  invokeFunction<ReconcileReport>("paystack", { action: "reconcile", from, to });
