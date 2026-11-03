import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { ChevronRight, Wallet } from "lucide-react";
import { listInvoices } from "../../lib/data/fees";
import { getOnlinePaymentStatus } from "../../lib/data/paystack";
import { getInstitutionDetails } from "../../lib/data/setup";
import { Skeleton } from "../components/ui/skeleton";
import { PayOnlineDialog } from "./fees/PayOnlineDialog";

function money(amount: number, currency: string): string {
  return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** What a parent owes for the child they are looking at, with a way to pay it right away. */
export function FeesSummaryCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const invoicesQ = useQuery({ queryKey: ["invoices"], queryFn: listInvoices });
  const onlineQ = useQuery({ queryKey: ["online-payment-status"], queryFn: getOnlinePaymentStatus, staleTime: 5 * 60_000, retry: false });
  const institutionQ = useQuery({ queryKey: ["institution-details"], queryFn: getInstitutionDetails });
  const currency = institutionQ.data?.currency || "GHS";
  const today = new Date().toISOString().slice(0, 10);

  const all = (invoicesQ.data ?? []).filter((i) => i.status !== "void");
  const mine = all.filter((i) => i.studentId === studentId);
  const billed = mine.reduce((s, i) => s + i.totalAmount, 0);
  const paid = mine.reduce((s, i) => s + i.paidAmount, 0);
  const owing = mine.filter((i) => i.balance > 0).sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const balance = owing.reduce((s, i) => s + i.balance, 0);
  const allChildren = all.reduce((s, i) => s + i.balance, 0);
  const otherChildren = Math.round((allChildren - balance) * 100) / 100;
  const share = billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : 0;
  const canPay = onlineQ.data?.configured === true;

  return (
    <section className="surface space-y-4 p-4 sm:p-5" aria-labelledby="fees-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="fees-summary-title" className="flex items-center gap-2 text-base font-semibold">
          <Wallet className="size-4 text-primary" aria-hidden />
          School fees for {studentName.split(" ")[0]}
        </h3>
        <Link to="/fees" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          Invoices and receipts <ChevronRight className="size-3.5" aria-hidden />
        </Link>
      </div>

      {invoicesQ.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : invoicesQ.isError ? (
        <p role="alert" className="text-sm text-destructive">The fees could not be loaded. Please try again shortly.</p>
      ) : mine.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fees have been billed for {studentName.split(" ")[0]} yet.</p>
      ) : balance === 0 ? (
        <p className="text-sm">
          <strong>All fees are paid.</strong> <span className="text-muted-foreground">{money(paid, currency)} received. Thank you!</span>
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Outstanding</div>
            <div className="text-3xl font-extrabold tabular-nums">{money(balance, currency)}</div>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/10"
              role="img" aria-label={`${share} percent of the fees billed have been paid`}
            >
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} />
            </div>
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">
              {money(paid, currency)} paid of {money(billed, currency)}
            </div>
          </div>

          <ul className="divide-y divide-border">
            {owing.map((inv) => {
              const overdue = !!inv.dueOn && inv.dueOn < today;
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="break-words text-sm font-medium">
                      {inv.termName ?? "School fees"} <span className="font-mono text-xs text-muted-foreground">{inv.number}</span>
                    </div>
                    <div className={overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                      {inv.dueOn ? (overdue ? `Overdue since ${shortDate(inv.dueOn)}` : `Due ${shortDate(inv.dueOn)}`) : "No due date"}
                      {" · "}
                      <span className="tabular-nums">{money(inv.balance, currency)} to pay</span>
                    </div>
                  </div>
                  {canPay ? (
                    <PayOnlineDialog
                      label="Pay now" invoiceId={inv.id} invoiceNumber={inv.number} studentName={inv.studentName}
                      balance={inv.balance} currency={currency} testMode={onlineQ.data?.mode === "test"}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          {!canPay && !onlineQ.isLoading ? (
            <p className="text-xs text-muted-foreground">To pay, please visit the school office. Online payment is not available yet.</p>
          ) : null}
          {otherChildren > 0 ? (
            <p className="text-xs text-muted-foreground">Your other children owe {money(otherChildren, currency)} in total. Use the buttons above to switch between them.</p>
          ) : null}
        </div>
      )}
    </section>
  );
}
