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
