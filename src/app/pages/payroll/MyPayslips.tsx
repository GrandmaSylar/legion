import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMyPayslipLines, listMyPayslips, type MyPayslip } from "../../../lib/data/payroll";
import { monthLabel } from "../../../lib/payroll";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useMoney } from "./shared";

function Payslip({ slip, onClose }: { slip: MyPayslip; onClose: () => void }) {
  const { fmt, currency } = useMoney();
  const lines = useQuery({ queryKey: ["my-payslip-lines", slip.id], queryFn: () => getMyPayslipLines(slip.id) });
  const earnings = (lines.data ?? []).filter((l) => l.kind === "earning");
  const deductions = (lines.data ?? []).filter((l) => l.kind === "deduction");
  const employer = (lines.data ?? []).filter((l) => l.kind === "employer");
  const Row = ({ name, amount, strong }: { name: string; amount: number; strong?: boolean }) => (
    <li className={`flex items-start justify-between gap-3 py-1.5 text-sm ${strong ? "font-semibold" : ""}`}><span className="min-w-0 break-words">{name}</span><span className="shrink-0 tabular-nums">{fmt(amount)}</span></li>
  );
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Payslip for {monthLabel(slip.year, slip.month)}</DialogTitle>
        <DialogDescription>{slip.paidAt ? `Paid ${new Date(slip.paidAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}</DialogDescription>
      </DialogHeader>
      <section aria-label="Earnings"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings</h3><ul className="divide-y divide-border">{earnings.map((l, i) => <Row key={i} name={l.name} amount={l.amount} />)}<Row name="Total earnings" amount={slip.gross} strong /></ul></section>
      {deductions.length > 0 ? <section aria-label="Deductions"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</h3><ul className="divide-y divide-border">{deductions.map((l, i) => <Row key={i} name={l.name} amount={l.amount} />)}<Row name="Total deductions" amount={slip.deductions} strong /></ul></section> : null}
      <p className="flex items-center justify-between rounded-xl bg-primary/10 p-3 text-base font-semibold"><span>Net pay</span><span className="tabular-nums">{fmt(slip.net)}</span></p>
      {employer.length > 0 ? <section aria-label="Paid by the school"><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paid by the school (not taken from your pay)</h3><ul className="divide-y divide-border">{employer.map((l, i) => <Row key={i} name={l.name} amount={l.amount} />)}</ul></section> : null}
      <DialogFooter className="gap-2">
        <DownloadMenu action="payroll.view_own" label="Download" formats={["pdf", "xlsx", "csv"]} disabled={!lines.data} getTable={() => ({
          title: `Payslip: ${monthLabel(slip.year, slip.month)}`, filename: `payslip-${slip.year}-${String(slip.month).padStart(2, "0")}`, subtitle: `Net pay ${currency} ${slip.net.toFixed(2)}`,
          columns: ["Item", "Type", `Amount (${currency})`], rows: [...(lines.data ?? []).map((l) => [l.name, l.kind === "earning" ? "Earning" : l.kind === "deduction" ? "Deduction" : "Paid by the school", l.amount.toFixed(2)]), ["Net pay", "", slip.net.toFixed(2)]],
        })} />
        <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
      </DialogFooter>
    </div>
  );
}

/** A member of staff's own payslips, from pay runs that have been paid. */
export function MyPayslips() {
  const list = useQuery({ queryKey: ["my-payslips"], queryFn: listMyPayslips, staleTime: 30_000 });
  const { fmt } = useMoney();
  const [open, setOpen] = useState<MyPayslip | null>(null);
  if (list.isLoading) return <Skeleton className="h-20 w-full" />;
  if (list.isError) return <p role="alert" className="surface p-4 text-sm">Your payslips could not be loaded.</p>;
  if (!list.data || list.data.length === 0) return <p className="surface p-6 text-center text-sm text-muted-foreground">You have no payslips yet. A payslip appears here once the month&apos;s pay has been paid.</p>;
  return (
    <>
      <ul className="grid gap-2">
        {list.data.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setOpen(p)} className="surface flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              <span><span className="block text-sm font-medium">{monthLabel(p.year, p.month)}</span><span className="block text-xs text-muted-foreground">Net pay</span></span>
              <span className="text-base font-semibold tabular-nums">{fmt(p.net)}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">{open ? <Payslip slip={open} onClose={() => setOpen(null)} /> : null}</DialogContent></Dialog>
    </>
  );
}
