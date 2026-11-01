import { Link } from "react-router";
import { ArrowLeft, Building2, Printer, Settings } from "lucide-react";
import type { InstitutionDetails } from "../../../lib/data/setup";
import type { PaymentSummaryRow } from "../../../lib/data/fees";
import { Button } from "../../components/ui/button";

function formatMoney(amount: number, currency = "GHS"): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function methodLabel(method: PaymentSummaryRow["method"], network: PaymentSummaryRow["network"]): string {
  if (method === "mobile_money") {
    const net =
      network === "mtn"
        ? "MTN MoMo"
        : network === "telecel"
          ? "Telecel Cash"
          : network === "airteltigo"
            ? "AT Money"
            : "Mobile Money";
    return `Mobile Money (${net})`;
  }
  if (method === "bank_transfer") return "Bank Transfer / Deposit";
  return "Cash";
}

export function ReceiptView({
  institution,
  payment,
  canConfigureSchool,
  onBack,
}: {
  institution: InstitutionDetails;
  payment: PaymentSummaryRow;
  canConfigureSchool?: boolean;
  onBack: () => void;
}) {
  const currency = institution.currency || "GHS";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
          Back to fees &amp; receipts
        </Button>

        <div className="flex flex-wrap items-center gap-2">
          {canConfigureSchool ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">
                <Settings className="size-3.5" aria-hidden />
                Edit school details on receipt
              </Link>
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden />
            Print / Save Receipt PDF
          </Button>
        </div>
      </div>

      <article className="surface mx-auto max-w-3xl overflow-hidden border border-border p-6 sm:p-8 print:max-w-none print:rounded-none print:border-slate-300 print:bg-white print:p-6 print:text-slate-900 print:shadow-none">
        {/* Top brand bar */}
        <div
          className="-mx-6 -mt-6 mb-6 h-2.5 sm:-mx-8 sm:-mt-8"
          style={{
            background: `linear-gradient(90deg, ${institution.brandPrimary || "var(--primary)"}, color-mix(in srgb, ${institution.brandPrimary || "var(--primary)"} 65%, #0f172a))`,
          }}
        />

        {/* Official School / Institution Header */}
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5 print:border-slate-300">
          <div className="flex items-start gap-4">
            {institution.logoUrl ? (
              <img
                src={institution.logoUrl}
                alt={`${institution.name} crest`}
                className="size-16 shrink-0 rounded-2xl border border-border bg-white object-contain p-1 print:border-slate-300"
              />
            ) : (
              <div
                className="grid size-16 shrink-0 place-items-center rounded-2xl text-white shadow-sm"
                style={{ backgroundColor: institution.brandPrimary || "var(--primary)" }}
              >
                <Building2 className="size-8" aria-hidden />
              </div>
            )}

            <div className="space-y-0.5">
              <h2 className="text-xl font-bold uppercase tracking-tight sm:text-2xl">
                {institution.name || "School Official Receipt"}
              </h2>
              {institution.motto ? (
                <p className="text-xs italic text-muted-foreground print:text-slate-600">
                  &ldquo;{institution.motto}&rdquo;
                </p>
              ) : null}
              {institution.address ? (
                <p className="text-xs text-muted-foreground print:text-slate-600">
                  {institution.address}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground print:text-slate-600">
                {[institution.phone, institution.email, institution.website]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {institution.taxOrRegNo ? (
                <p className="text-[11px] font-medium text-muted-foreground print:text-slate-600">
                  Reg / TIN: {institution.taxOrRegNo}
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <span className="inline-block rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 print:border print:border-emerald-700 print:text-emerald-800">
              Official Payment Receipt
            </span>
            <div className="mt-2 font-mono text-base font-bold tabular-nums">
              {payment.receiptNo}
            </div>
            <div className="text-xs text-muted-foreground print:text-slate-600">
              Date: {payment.paidOn}
            </div>
          </div>
        </header>

        {/* Student & Invoice Metadata */}
        <section className="my-5 grid grid-cols-2 gap-4 rounded-2xl border border-border bg-foreground/[0.02] p-4 text-xs sm:grid-cols-4 sm:text-sm print:border-slate-300 print:bg-slate-50">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Received From (Pupil)
            </div>
            <div className="font-semibold">{payment.studentName}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Admission No.
            </div>
            <div className="font-semibold tabular-nums">
              {payment.studentAdmissionNo}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Invoice Ref.
            </div>
            <div className="font-mono font-semibold tabular-nums">
              {payment.invoiceNumber}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground print:text-slate-500">
              Term / Period
            </div>
            <div className="font-semibold">
              {payment.termName ?? "General Billing"}
            </div>
          </div>
        </section>

        {/* Invoice Breakdown Table */}
        {payment.invoiceItems.length > 0 ? (
          <div className="mb-5 overflow-x-auto">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground print:text-slate-600">
              Billed Items on Invoice {payment.invoiceNumber}
            </div>
            <table className="w-full border-collapse text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-y border-border bg-foreground/[0.03] text-xs uppercase tracking-wider text-muted-foreground print:border-slate-300 print:bg-slate-100 print:text-slate-700">
                  <th className="py-2 pl-3 pr-2 font-semibold">Description</th>
                  <th className="py-2 px-2 font-semibold">Type</th>
                  <th className="py-2 pl-2 pr-3 text-right font-semibold">
                    Amount ({currency})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border print:divide-slate-200">
                {payment.invoiceItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 pl-3 pr-2 font-medium">
                      {item.description}
                    </td>
                    <td className="py-2 px-2 capitalize text-muted-foreground print:text-slate-600">
                      {item.kind}
                    </td>
                    <td className="py-2 pl-2 pr-3 text-right font-mono tabular-nums">
                      {formatMoney(item.amount, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Payment Summary Highlight */}
        <section className="rounded-2xl border border-border bg-primary/[0.04] p-4 sm:p-5 print:border-slate-300 print:bg-slate-50">
          <div className="grid gap-4 sm:grid-cols-2 sm:items-center">
            <div className="space-y-1 text-xs sm:text-sm">
              <div>
                <span className="text-muted-foreground print:text-slate-600">
                  Payment Method:{" "}
                </span>
                <span className="font-semibold">
                  {methodLabel(payment.method, payment.network)}
                </span>
              </div>
              {payment.reference ? (
                <div>
                  <span className="text-muted-foreground print:text-slate-600">
                    Transaction Ref:{" "}
                  </span>
                  <span className="font-mono font-medium">
                    {payment.reference}
                  </span>
                </div>
              ) : null}
              <div>
                <span className="text-muted-foreground print:text-slate-600">
                  Received By:{" "}
                </span>
                <span className="font-medium">
                  {payment.receivedByName || "Accounts Office"}
                </span>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border pt-3 text-right sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 print:border-slate-300">
              <div className="text-xs uppercase tracking-wider text-muted-foreground print:text-slate-600">
                Amount Paid on This Receipt
              </div>
              <div className="text-2xl font-extrabold tracking-tight text-emerald-700 tabular-nums dark:text-emerald-400 print:text-slate-900 sm:text-3xl">
                {formatMoney(payment.amount, currency)}
              </div>
              <div className="flex justify-end gap-4 text-xs text-muted-foreground print:text-slate-600">
                <span>
                  Invoice Total: {formatMoney(payment.invoiceTotal, currency)}
                </span>
                <span className="font-semibold text-foreground print:text-slate-900">
                  Balance Remaining:{" "}
                  {formatMoney(payment.invoiceBalance, currency)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Bank / Mobile Money Details & Footer */}
        <footer className="mt-6 space-y-4 border-t border-border pt-4 text-xs text-muted-foreground print:border-slate-300 print:text-slate-600">
          <div className="grid gap-6 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1">
              {institution.bankDetails ? (
                <div>
                  <span className="font-semibold text-foreground print:text-slate-800">
                    School Payment Channels:{" "}
                  </span>
                  <span>{institution.bankDetails}</span>
                </div>
              ) : null}
              {institution.receiptFooter ? (
                <p className="italic">{institution.receiptFooter}</p>
              ) : (
                <p className="italic">
                  Thank you for your payment. Please keep this official receipt
                  for your records.
                </p>
              )}
            </div>

            <div className="border-t border-border pt-2 text-right print:border-slate-400">
              <div className="font-medium text-foreground print:text-slate-900">
                {payment.receivedByName || "Authorized Cashier / Bursar"}
              </div>
              <div>Official Signature &amp; School Stamp</div>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}
