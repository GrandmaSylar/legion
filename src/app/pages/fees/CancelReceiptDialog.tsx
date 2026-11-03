import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban } from "lucide-react";
import { voidPayment } from "../../../lib/data/fees";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, controlClass } from "../../components/fields";
import { cn } from "../../components/ui/utils";

/**
 * Cancels a receipt. It is never deleted: it stays on record, marked cancelled with who
 * did it and why, and the invoice owes the money again. A payment made online has to be
 * refunded in Paystack first, so its refund reference is asked for here.
 */
export function CancelReceiptDialog({
  paymentId, receiptNo, amountLabel, paidOnline, size = "sm",
}: {
  paymentId: string; receiptNo: string; amountLabel: string; paidOnline: boolean; size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState("");

  const cancel = useMutation({
    mutationFn: () => voidPayment({ paymentId, reason: reason.trim(), refundReference: refund }),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["online-payments"] });
      void qc.invalidateQueries({ queryKey: ["school-analytics"] });
    },
  });
  const ready = reason.trim().length >= 5 && (!paidOnline || refund.trim().length >= 3);
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) cancel.mutate(); };

  return (
    <>
      <Button type="button" size={size} variant="outline" onClick={() => { setReason(""); setRefund(""); cancel.reset(); setOpen(true); }}>
        <Ban className="size-3.5" aria-hidden /> Cancel receipt
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Cancel receipt {receiptNo}?</DialogTitle>
              <DialogDescription>
                {amountLabel} will count as unpaid again. The receipt is not deleted: it stays on record, marked cancelled, with your name, the date and your reason.
              </DialogDescription>
            </DialogHeader>

            {paidOnline ? (
              <p role="note" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                This was paid online. <strong>Refund it in Paystack first</strong> (Transactions, find the payment, Refund), then enter the refund reference below. Cancelling here does not return any money by itself.
              </p>
            ) : null}

            <Field label="Why is it being cancelled?" htmlFor="void-reason">
              <textarea
                id="void-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} required
                placeholder="For example: entered twice by mistake" className={cn(controlClass, "h-auto min-h-20 py-2")}
              />
            </Field>
            {paidOnline ? (
              <Field label="Paystack refund reference" htmlFor="void-refund">
                <Input id="void-refund" value={refund} onChange={(e) => setRefund(e.target.value)} autoComplete="off" required />
              </Field>
            ) : null}

            <FormMessage error={cancel.isError ? friendlyError(cancel.error) : null} />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Keep the receipt</Button>
              <Button type="submit" variant="destructive" disabled={!ready || cancel.isPending}>{cancel.isPending ? "Cancelling" : "Cancel receipt"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
