import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { checkOnlinePayment, reconcileWithPaystack, type PaymentLine, type ReconcileReport } from "../../../lib/data/paystack";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FormMessage } from "../../components/fields";

const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: Date) => d.toISOString().slice(0, 10);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

function RecordNow({ reference, onDone }: { reference: string; onDone: () => void }) {
  const qc = useQueryClient();
  const record = useMutation({
    mutationFn: () => checkOnlinePayment(reference),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["online-payments"] });
      onDone();
    },
  });
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={record.isPending || record.isSuccess} onClick={() => record.mutate()}>
        {record.isSuccess ? "Recorded" : record.isPending ? "Recording" : "Record it now"}
      </Button>
      {record.isError ? <span role="alert" className="text-xs text-destructive">{record.error instanceof Error ? record.error.message : "Could not record it."}</span> : null}
    </span>
  );
}

function Issue({ title, why, children }: { title: string; why: string; children: React.ReactNode }) {
  return (
    <section className="surface space-y-3 border-amber-500/50 p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden /> {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{why}</p>
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

function Line({ p, currency, extra }: { p: PaymentLine; currency: string; extra?: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
      <span className="min-w-0 break-all font-mono text-xs">{p.reference}</span>
      <span className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted-foreground">{when(p.paidAt)}</span>
        <span className="font-mono font-semibold tabular-nums">{money(p.amount, currency)}</span>
        {extra}
      </span>
    </li>
  );
}

export function PaystackCheck({ currency }: { currency: string }) {
  const now = new Date();
  const [from, setFrom] = useState(day(new Date(now.getTime() - 6 * 86_400_000)));
  const [to, setTo] = useState(day(now));
  const run = useMutation({ mutationFn: () => reconcileWithPaystack(from, to) });
  const submit = (e: FormEvent) => { e.preventDefault(); run.mutate(); };
  const r: ReconcileReport | undefined = run.data;
  const problems = r ? r.paidNotRecorded.length + r.recordedNotInPaystack.length + r.amountMismatch.length : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Compares what Paystack says it received with the receipts Legion has written, for the dates you choose. Run it weekly. It takes a few seconds.
      </p>

      <form onSubmit={submit} className="surface flex flex-wrap items-end gap-3 p-4">
        <Field label="From" htmlFor="rc-from"><Input id="rc-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} required /></Field>
        <Field label="To" htmlFor="rc-to"><Input id="rc-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} required /></Field>
        <Button type="submit" disabled={run.isPending}>{run.isPending ? "Checking with Paystack" : "Check now"}</Button>
      </form>
      <FormMessage error={run.isError ? (run.error instanceof Error ? run.error.message : "The check could not be run.") : null} />

      {r ? (
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Totals">
            <div className="surface p-4">
              <div className="text-xs font-medium text-muted-foreground">Paystack received</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{money(r.paystack.total, currency)}</div>
              <div className="text-xs text-muted-foreground">{r.paystack.count} {r.paystack.count === 1 ? "payment" : "payments"}</div>
            </div>
            <div className="surface p-4">
              <div className="text-xs font-medium text-muted-foreground">Paystack's charges</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{r.paystack.fees === null ? "Not shown" : money(r.paystack.fees, currency)}</div>
              <div className="text-xs text-muted-foreground">{r.paystack.net === null ? "Check your Paystack payouts" : `Expected payout ${money(r.paystack.net, currency)}`}</div>
            </div>
            <div className="surface p-4">
              <div className="text-xs font-medium text-muted-foreground">Legion's online receipts</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{money(r.legion.total, currency)}</div>
              <div className="text-xs text-muted-foreground">{r.legion.count} {r.legion.count === 1 ? "receipt" : "receipts"}</div>
            </div>
            <div className="surface p-4">
              <div className="text-xs font-medium text-muted-foreground">Matched one to one</div>
              <div className="mt-1 text-xl font-bold tabular-nums">{r.matched}</div>
              <div className="text-xs text-muted-foreground">same reference, same amount</div>
            </div>
          </section>

          {r.truncated ? (
            <p role="alert" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
              That period has more payments than can be checked at once. Choose a shorter period. Receipts missing from Paystack are not listed for this reason.
            </p>
          ) : null}

          {problems === 0 && !r.truncated ? (
            <p role="status" className="surface flex items-start gap-2 p-4 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
              <span><strong>Everything matches.</strong> Every payment Paystack received in this period has a Legion receipt for the same amount, and every online receipt is in Paystack.</span>
            </p>
          ) : null}

          {r.paidNotRecorded.length > 0 ? (
            <Issue title="Paid in Paystack, but no receipt in Legion" why="The parent was charged but Legion has not written the receipt. Recording it now checks with Paystack first.">
              {r.paidNotRecorded.map((p) => <Line key={p.reference} p={p} currency={currency} extra={<RecordNow reference={p.reference} onDone={() => run.mutate()} />} />)}
            </Issue>
          ) : null}

          {r.recordedNotInPaystack.length > 0 ? (
            <Issue title="Receipt in Legion, but Paystack has no such payment" why="Look at these first. A receipt for money Paystack never received should not exist. Check Paystack's own list for the reference; if it is really absent, cancel the receipt and tell the developer.">
              {r.recordedNotInPaystack.map((p) => (
                <Line key={p.reference} p={{ reference: p.reference, amount: p.amount, paidAt: p.paidAt, channel: null }} currency={currency} extra={<span className="font-mono text-xs">{p.receiptNo}</span>} />
              ))}
            </Issue>
          ) : null}

          {r.amountMismatch.length > 0 ? (
            <Issue title="Both have it, but for different amounts" why="Check the payment in Paystack. Do not rely on either figure until you know which is right.">
              {r.amountMismatch.map((p) => (
                <li key={p.reference} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 break-all font-mono text-xs">{p.reference}</span>
                  <span className="tabular-nums">Paystack {money(p.paystackAmount, currency)} · Legion {money(p.legionAmount, currency)}</span>
                </li>
              ))}
            </Issue>
          ) : null}

          {r.notFromLegion.length > 0 ? (
            <section className="surface space-y-2 p-4">
              <h3 className="text-sm font-semibold">Other payments on your Paystack account ({r.notFromLegion.length})</h3>
              <p className="text-sm text-muted-foreground">These did not start from Legion, so there is nothing to match them to. They are normal if the same Paystack account is used for anything else.</p>
              <ul className="divide-y divide-border">{r.notFromLegion.map((p) => <Line key={p.reference} p={p} currency={currency} />)}</ul>
            </section>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Paystack pays the school after taking its charges. To check the money reached the bank or wallet, compare the expected payout above with the payouts in your Paystack dashboard for the same days.
          </p>
        </div>
      ) : null}
    </div>
  );
}
