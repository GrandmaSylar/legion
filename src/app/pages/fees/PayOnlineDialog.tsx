import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { CreditCard } from "lucide-react";
import { startOnlinePayment } from "../../../lib/data/paystack";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage } from "../../components/fields";

export function PayOnlineDialog({
  invoiceId, invoiceNumber, studentName, balance, currency, testMode, label = "Pay online",
}: {
  label?: string; invoiceId: string; invoiceNumber: string; studentName: string; balance: number; currency: string; testMode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(balance.toFixed(2));
  const value = Number(amount);
  const valid = Number.isFinite(value) && value >= 1 && value <= balance;

  const pay = useMutation({
    mutationFn: () => startOnlinePayment(invoiceId, Math.round(value * 100) / 100),
    // Paystack's own page takes the payment; we are told the result when they send the parent back.
    onSuccess: (r) => window.location.assign(r.authorizationUrl),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) pay.mutate(); };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => { setAmount(balance.toFixed(2)); pay.reset(); setOpen(true); }}>
        <CreditCard className="size-4" aria-hidden /> {label}
      </Button>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Pay school fees online</DialogTitle>
            <DialogDescription>
              {studentName} · invoice {invoiceNumber}. You will go to Paystack's secure page to pay by card or mobile money, then come back here for your receipt.
            </DialogDescription>
          </DialogHeader>
          {testMode ? (
            <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              Test mode: no real money moves. Use a Paystack test card.
            </p>
          ) : null}
          <p className="text-sm">Balance: <strong className="tabular-nums">{currency} {balance.toFixed(2)}</strong></p>
          <Field label={`Amount to pay (${currency})`} htmlFor="pay-amount">
            <Input id="pay-amount" type="number" inputMode="decimal" min={1} max={balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </Field>
          <p className="text-xs text-muted-foreground">You can pay all of it now or part of it, at least {currency} 1.00.</p>
          <FormMessage error={pay.isError ? (pay.error instanceof Error ? pay.error.message : "Something went wrong.") : value > balance ? "That is more than the balance." : null} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={!valid || pay.isPending || pay.isSuccess}>{pay.isPending || pay.isSuccess ? "Opening Paystack" : "Continue to Paystack"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
