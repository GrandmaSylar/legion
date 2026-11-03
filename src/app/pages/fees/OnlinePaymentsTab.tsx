import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Search } from "lucide-react";
import { listOnlinePayments, resolveOnlinePayment, type OnlinePaymentRow, type OnlinePaymentStatus } from "../../../lib/data/onlinePayments";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { CancelReceiptDialog } from "./CancelReceiptDialog";

type Filter = "review" | "all" | OnlinePaymentStatus;

const STATUS_LABEL: Record<OnlinePaymentStatus, string> = {
  pending: "Waiting for the parent",
  success: "Paid",
  failed: "Did not go through",
  abandoned: "Abandoned",
  refunded: "Refunded",
};
const STATUS_STYLE: Record<OnlinePaymentStatus, string> = {
  pending: "bg-foreground/10 text-muted-foreground",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  abandoned: "bg-foreground/10 text-muted-foreground",
  refunded: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
};

function money(n: number, currency: string) {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function when(iso: string) {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ReviewForm({ id, onDone }: { id: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const resolve = useMutation({
    mutationFn: () => resolveOnlinePayment(id, note.trim()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["online-payments"] }); onDone(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (note.trim().length >= 5) resolve.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-border p-3">
      <Field label="What was done about it?" htmlFor={`review-${id}`}>
        <Input id={`review-${id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: refunded the extra GHS 20 in Paystack" autoComplete="off" required />
      </Field>
      <FormMessage error={resolve.isError ? friendlyError(resolve.error) : null} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={note.trim().length < 5 || resolve.isPending}>{resolve.isPending ? "Saving" : "Mark as reviewed"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function Row({ p, currency }: { p: OnlinePaymentRow; currency: string }) {
  const [reviewing, setReviewing] = useState(false);
  return (
    <li className={cn("surface space-y-2 p-4", p.needsReview && "border-amber-500/50")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="break-words text-sm font-medium">
            {p.studentName || "Student"} <span className="font-mono text-xs text-muted-foreground">{p.invoiceNumber}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {p.parentName ? `${p.parentName} · ` : ""}{when(p.paidAt ?? p.createdAt)}
            {p.channel ? ` · ${p.channel.replace("_", " ")}` : ""}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums">{money(p.amount, currency)}</span>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[p.status])}>{STATUS_LABEL[p.status]}</span>
        </div>
      </div>

      <div className="break-all font-mono text-xs text-muted-foreground">
        Reference {p.reference}{p.receiptNo ? ` · Receipt ${p.receiptNo}${p.receiptCancelled ? " (cancelled)" : ""}` : ""}
      </div>

      {p.needsReview ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="break-words">{p.note ?? "This payment needs to be looked at."}</span>
        </p>
      ) : p.note ? (
        <p className="break-words text-xs text-muted-foreground">{p.note}</p>
      ) : null}
      {p.reviewedAt ? (
        <p className="break-words text-xs text-muted-foreground">Reviewed {when(p.reviewedAt)}: {p.reviewNote}</p>
      ) : null}

      {reviewing ? <ReviewForm id={p.id} onDone={() => setReviewing(false)} /> : (
        <div className="flex flex-wrap gap-2">
          {p.needsReview ? <Button size="sm" onClick={() => setReviewing(true)}>Mark as reviewed</Button> : null}
          {p.status === "success" && p.paymentId && !p.receiptCancelled ? (
            <CancelReceiptDialog paymentId={p.paymentId} receiptNo={p.receiptNo ?? ""} amountLabel={money(p.amount, currency)} paidOnline />
          ) : null}
        </div>
      )}
    </li>
  );
}

export function OnlinePaymentsTab({ currency }: { currency: string }) {
  const q = useQuery({ queryKey: ["online-payments"], queryFn: listOnlinePayments });
  const [filter, setFilter] = useState<Filter>("review");
  const [search, setSearch] = useState("");

  const all = q.data ?? [];
  const counts = useMemo(() => {
    const c: Record<string, number> = { review: 0, all: all.length };
    for (const p of all) {
      if (p.needsReview) c.review++;
      c[p.status] = (c[p.status] ?? 0) + 1;
    }
    return c;
  }, [all]);

  const shown = all.filter((p) => {
    if (filter === "review" ? !p.needsReview : filter !== "all" && p.status !== filter) return false;
    const t = search.trim().toLowerCase();
    return !t || [p.reference, p.studentName, p.invoiceNumber, p.parentName ?? "", p.receiptNo ?? ""].some((x) => x.toLowerCase().includes(t));
  });

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "review", label: "Needs review" },
    { id: "all", label: "All" },
    { id: "success", label: "Paid" },
    { id: "pending", label: "Waiting" },
    { id: "failed", label: "Failed" },
    { id: "refunded", label: "Refunded" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Every payment a parent started online. Anything odd is put under <strong>Needs review</strong>, such as a wrong amount, an invoice paid twice, or an invoice cancelled before the payment arrived. Paystack's own list is the final record of what happened to the money.
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter online payments">
        {FILTERS.map((f) => (
          <button
            key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              filter === f.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums", f.id === "review" && counts.review > 0 && filter !== f.id && "rounded-full bg-amber-500 px-1.5 text-white")}>
              {counts[f.id] ?? 0}
            </span>
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search online payments" className="pl-9" placeholder="Search by reference, student, invoice or receipt" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {q.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {q.isError ? <p role="alert" className="text-sm text-destructive">The online payments could not be loaded.</p> : null}
      {!q.isLoading && shown.length === 0 ? (
        <section className="surface p-6 text-sm text-muted-foreground">
          {filter === "review" ? "Nothing needs review. Every online payment so far has gone through cleanly." : all.length === 0 ? "No online payments have been started yet." : "No payments match."}
        </section>
      ) : null}
      <ul className="space-y-3">{shown.map((p) => <Row key={p.id} p={p} currency={currency} />)}</ul>
    </div>
  );
}
