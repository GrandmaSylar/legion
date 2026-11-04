import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  addAdjustment, approveRun, calculateRun, cancelRun, createRun, getBankList, listAdjustments, listPayStaff, listRunLog, listRuns, listSignatures, listSlipLines,
  listSlips, listSteps, markPaid, rejectRun, removeAdjustment, submitRun, type Run, type Slip,
} from "../../../lib/data/payroll";
import { RUN_STATUS_HELP, monthLabel, parseAmount } from "../../../lib/payroll";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { RunStatusChip, useMoney } from "./shared";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

function SlipRow({ slip }: { slip: Slip }) {
  const { fmt } = useMoney();
  const [open, setOpen] = useState(false);
  const lines = useQuery({ queryKey: ["slip-lines", slip.id], queryFn: () => listSlipLines(slip.id), enabled: open });
  return (
    <li className="rounded-xl border border-border">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-12 w-full items-start justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
        <span className="min-w-0"><span className="block break-words text-sm font-medium">{slip.name}</span><span className="block break-words text-xs text-muted-foreground">{slip.job ?? ""}{slip.staffNo ? ` · ${slip.staffNo}` : ""}</span></span>
        <span className="shrink-0 text-right text-sm tabular-nums"><span className="block font-semibold">{fmt(slip.net)}</span><span className="block text-xs text-muted-foreground">gross {fmt(slip.gross)}</span></span>
      </button>
      {open ? (
        <ul className="divide-y divide-border border-t border-border px-3 text-sm">
          {(lines.data ?? []).map((l, i) => <li key={i} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 break-words">{l.kind === "deduction" ? "Less: " : ""}{l.name}</span><span className="shrink-0 tabular-nums">{fmt(l.amount)}</span></li>)}
          {lines.isLoading ? <li className="py-2"><Skeleton className="h-4 w-full" /></li> : null}
        </ul>
      ) : null}
    </li>
  );
}

function Adjustments({ run, slips, editable }: { run: Run; slips: Slip[]; editable: boolean }) {
  const qc = useQueryClient();
  const adj = useQuery({ queryKey: ["payroll-adjustments", run.id], queryFn: () => listAdjustments(run.id) });
  const staff = useQuery({ queryKey: ["payroll-staff"], queryFn: listPayStaff, enabled: editable, staleTime: 60_000, retry: false });
  const { fmt } = useMoney();
  const [who, setWho] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"earning" | "deduction">("earning");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["payroll-adjustments", run.id] }); void qc.invalidateQueries({ queryKey: ["payroll-runs"] }); void qc.invalidateQueries({ queryKey: ["payroll-slips", run.id] }); };
  const add = useMutation({ mutationFn: () => addAdjustment(run.id, who, name, kind, parseAmount(amount) ?? 0, note), onSuccess: () => { setName(""); setAmount(""); setNote(""); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => removeAdjustment(id), onSuccess: refresh });
  const names = new Map([...(staff.data ?? []).map((s) => [s.staffId, s.name] as const), ...slips.map((s) => [s.staffId, s.name] as const)]);
  const ok = !!who && name.trim() && parseAmount(amount) !== null && (parseAmount(amount) ?? 0) > 0;
  return (
    <section aria-label="One-off adjustments" className="space-y-2">
      <h3 className="text-sm font-semibold">One-off adjustments for this month</h3>
      {(adj.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
      <ul className="space-y-1">
        {(adj.data ?? []).map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 break-words">{names.get(a.staffId) ?? "Someone"}: {a.kind === "deduction" ? "less " : "plus "}{a.name}{a.note ? ` (${a.note})` : ""}</span>
            <span className="flex shrink-0 items-center gap-1 tabular-nums">{fmt(a.amount)}{editable ? <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${a.name}`} disabled={remove.isPending} onClick={() => remove.mutate(a.id)}><Trash2 className="size-4" aria-hidden /></Button> : null}</span>
          </li>
        ))}
      </ul>
      {editable ? (
        <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
          <NativeSelect aria-label="Staff member" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Choose a member of staff</option>{(staff.data ?? []).filter((s) => s.basic !== null).map((s) => <option key={s.staffId} value={s.staffId}>{s.name}</option>)}</NativeSelect>
          <NativeSelect aria-label="Added or taken off" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="earning">Added to pay (a bonus)</option><option value="deduction">Taken from pay (an advance paid back)</option></NativeSelect>
          <Input aria-label="Name" placeholder="What it is, e.g. Bonus" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          <Input aria-label="Amount" placeholder="Amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input aria-label="Note" className="sm:col-span-2" placeholder="Note (optional)" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <div className="sm:col-span-2"><Button type="button" size="sm" disabled={add.isPending || !ok} onClick={() => add.mutate()}><Plus className="size-4" aria-hidden /> {add.isPending ? "Adding" : "Add adjustment"}</Button></div>
          <div className="sm:col-span-2"><FormMessage error={add.isError ? friendlyError(add.error) : remove.isError ? friendlyError(remove.error) : null} /></div>
        </div>
      ) : null}
    </section>
  );
}

function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const { fmt } = useMoney();
  const fresh = useQuery({ queryKey: ["payroll-runs"], queryFn: listRuns, staleTime: 3_000 }).data?.find((r) => r.id === run.id) ?? run;
  const slips = useQuery({ queryKey: ["payroll-slips", run.id], queryFn: () => listSlips(run.id) });
  const steps = useQuery({ queryKey: ["payroll-steps"], queryFn: listSteps, staleTime: 30_000 });
  const sigs = useQuery({ queryKey: ["payroll-sigs", run.id], queryFn: () => listSignatures(run.id) });
  const history = useQuery({ queryKey: ["payroll-history", run.id], queryFn: () => listRunLog(run.id) });
  const [comment, setComment] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"" | "reject" | "pay" | "cancel">("");
  const refresh = () => { for (const k of ["payroll-runs", "payroll-slips", "payroll-sigs", "payroll-history", "payroll-adjustments"]) void qc.invalidateQueries({ queryKey: [k] }); };
  const done = () => { setMode(""); setReason(""); setComment(""); refresh(); };
  const calc = useMutation({ mutationFn: () => calculateRun(run.id), onSuccess: refresh });
  const submit = useMutation({ mutationFn: () => submitRun(run.id), onSuccess: refresh });
  const approve = useMutation({ mutationFn: () => approveRun(run.id, comment), onSuccess: done });
  const reject = useMutation({ mutationFn: () => rejectRun(run.id, reason), onSuccess: done });
  const pay = useMutation({ mutationFn: () => markPaid(run.id, reason), onSuccess: done });
  const cancel = useMutation({ mutationFn: () => cancelRun(run.id, reason), onSuccess: () => { done(); onClose(); } });
  const err = [calc, submit, approve, reject, pay, cancel].find((m) => m.isError);
  const totals = useMemo(() => (slips.data ?? []).reduce((t, s) => ({ gross: t.gross + s.gross, ded: t.ded + s.deductions, net: t.net + s.net }), { gross: 0, ded: 0, net: 0 }), [slips.data]);
  const status = fresh.status;
  const signedLabels = new Set((sigs.data ?? []).map((s) => s.stepLabel));
  const editable = can("payroll.prepare") && (status === "draft" || status === "calculated");

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{monthLabel(run.year, run.month)}</DialogTitle>
        <DialogDescription><span className="mr-2 align-middle"><RunStatusChip status={status} /></span>{RUN_STATUS_HELP[status]}</DialogDescription>
      </DialogHeader>
      <p className="grid grid-cols-3 gap-2 rounded-xl bg-foreground/5 p-3 text-center text-xs tabular-nums">
        <span><span className="block text-muted-foreground">Gross</span><span className="text-sm font-semibold">{fmt(totals.gross)}</span></span>
        <span><span className="block text-muted-foreground">Deductions</span><span className="text-sm font-semibold">{fmt(totals.ded)}</span></span>
        <span><span className="block text-muted-foreground">Net to pay</span><span className="text-sm font-semibold">{fmt(totals.net)}</span></span>
      </p>

      {(steps.data ?? []).length > 0 && status !== "draft" && status !== "calculated" && status !== "cancelled" ? (
        <section aria-label="Approval" className="space-y-1">
          <h3 className="text-sm font-semibold">Approval</h3>
          <ol className="space-y-1 text-sm">{(steps.data ?? []).map((s) => {
            const sig = (sigs.data ?? []).find((x) => x.stepLabel === s.label);
            return <li key={s.id} className="flex flex-wrap gap-2"><span className="font-medium">{s.position}. {s.label}</span><span className="text-muted-foreground">{signedLabels.has(s.label) ? `signed by ${sig?.signedBy ?? "someone"}, ${sig ? when(sig.at) : ""}` : "waiting"}</span></li>;
          })}</ol>
        </section>
      ) : status === "in_approval" || status === "approved" || status === "paid" ? (
        <section aria-label="Approval" className="text-sm">{(sigs.data ?? []).map((s, i) => <p key={i}>Approved by {s.signedBy ?? "someone"}, {when(s.at)}{s.comment ? `: ${s.comment}` : ""}</p>)}</section>
      ) : null}

      <section aria-label="Payslips" className="space-y-2">
        <h3 className="text-sm font-semibold">Payslips ({slips.data?.length ?? 0})</h3>
        {slips.isLoading ? <Skeleton className="h-12 w-full" /> : null}
        {slips.data && slips.data.length === 0 ? <p className="text-sm text-muted-foreground">No payslips yet. Calculate the pay run to make them. Only staff with pay details get one.</p> : null}
        <ul className="grid gap-2">{(slips.data ?? []).map((s) => <SlipRow key={s.id} slip={s} />)}</ul>
      </section>

      {status !== "cancelled" ? <Adjustments run={run} slips={slips.data ?? []} editable={editable} /> : null}

      {mode ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <label htmlFor="pr-reason" className="text-sm font-medium">{mode === "reject" ? "What needs to change?" : mode === "pay" ? "How was it paid? (optional)" : "Why is it being cancelled? (optional)"}</label>
          <Textarea id="pr-reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "pay" ? "default" : "destructive"} disabled={reject.isPending || pay.isPending || cancel.isPending || (mode === "reject" && reason.trim().length < 3)}
              onClick={() => (mode === "reject" ? reject.mutate() : mode === "pay" ? pay.mutate() : cancel.mutate())}>{mode === "reject" ? "Send it back" : mode === "pay" ? "Mark as paid" : "Cancel the pay run"}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode("")}>Not now</Button>
          </div>
        </div>
      ) : null}
      {status === "in_approval" && can("payroll.approve") && !mode ? (
        <div className="space-y-2"><label htmlFor="pr-comment" className="text-sm font-medium">Comment (optional)</label><Input id="pr-comment" value={comment} maxLength={300} onChange={(e) => setComment(e.target.value)} /></div>
      ) : null}
      {calc.isSuccess ? <p role="status" className="text-sm text-muted-foreground">Calculated: {calc.data.slips} {calc.data.slips === 1 ? "payslip" : "payslips"}{calc.data.skipped ? `, ${calc.data.skipped} staff left out because they have no pay details` : ""}.</p> : null}
      <FormMessage error={err ? friendlyError(err.error) : null} />

      <div className="flex flex-wrap gap-2">
        {can("payroll.prepare") && (status === "draft" || status === "calculated") ? <Button type="button" disabled={calc.isPending} onClick={() => calc.mutate()}>{calc.isPending ? "Calculating" : status === "draft" ? "Calculate" : "Recalculate"}</Button> : null}
        {can("payroll.prepare") && status === "calculated" ? <Button type="button" variant="outline" disabled={submit.isPending} onClick={() => submit.mutate()}>{submit.isPending ? "Sending" : "Send for approval"}</Button> : null}
        {status === "in_approval" && can("payroll.approve") && !mode ? <><Button type="button" disabled={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? "Signing" : "Approve"}</Button><Button type="button" variant="outline" onClick={() => setMode("reject")}>Send back</Button></> : null}
        {status === "approved" && can("payroll.pay") && !mode ? <Button type="button" onClick={() => setMode("pay")}>Mark as paid</Button> : null}
        {can("payroll.prepare") && status !== "paid" && status !== "cancelled" && !mode ? <Button type="button" variant="ghost" className="text-destructive" onClick={() => setMode("cancel")}>Cancel pay run</Button> : null}
        <DownloadMenu action="payroll.download" label="Register" disabled={!slips.data?.length} getTable={() => ({
          title: `Payroll register: ${monthLabel(run.year, run.month)}`, filename: `payroll-${run.year}-${String(run.month).padStart(2, "0")}`,
          columns: ["Name", "Staff no.", "Job", "Basic", "Gross", "Deductions", "Net"], rows: (slips.data ?? []).map((s) => [s.name, s.staffNo ?? "", s.job ?? "", s.basic.toFixed(2), s.gross.toFixed(2), s.deductions.toFixed(2), s.net.toFixed(2)]),
        })} />
        <DownloadMenu action="payroll.download" label="Bank list" disabled={!slips.data?.length || (status !== "approved" && status !== "paid")} getTable={async () => {
          const rows = await getBankList(run.id);
          return { title: `Bank payment list: ${monthLabel(run.year, run.month)}`, filename: `bank-list-${run.year}-${String(run.month).padStart(2, "0")}`, columns: ["Name", "Bank", "Account name", "Account number", "Net pay"],
            rows: rows.map((r) => [r.staffName, r.bankName ?? "", r.accountName ?? "", r.accountNo ?? "", r.net.toFixed(2)]) };
        }} />
      </div>
      <details className="text-sm"><summary className="cursor-pointer font-medium">What has been done</summary>
        <ul className="mt-2 space-y-1">{(history.data ?? []).map((h, i) => <li key={i} className="break-words text-xs text-muted-foreground">{when(h.at)} · {h.actorName ?? "Someone"} {h.action}{h.detail ? `: ${h.detail}` : ""}</li>)}</ul>
      </details>
      <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Close</Button></DialogFooter>
    </div>
  );
}

/** Pay runs: one for each month. Prepare, send for approval, sign, pay. */
export function RunsTab() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const runs = useQuery({ queryKey: ["payroll-runs"], queryFn: listRuns, staleTime: 10_000 });
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [open, setOpen] = useState<Run | null>(null);
  const start = useMutation({ mutationFn: () => createRun(Number(year), Number(month)), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["payroll-runs"] }); } });
  const go = (e: FormEvent) => { e.preventDefault(); start.mutate(); };
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {can("payroll.prepare") ? (
        <form onSubmit={go} className="surface grid gap-3 p-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <Field label="Month" htmlFor="pr-month"><NativeSelect id="pr-month" value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((m) => <option key={m} value={m}>{monthLabel(2000, m).replace(" 2000", "")}</option>)}</NativeSelect></Field>
          <Field label="Year" htmlFor="pr-year"><Input id="pr-year" type="number" min="2020" max="2100" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <Button type="submit" disabled={start.isPending}>{start.isPending ? "Starting" : "Start a pay run"}</Button>
          <div className="sm:col-span-3"><FormMessage error={start.isError ? friendlyError(start.error) : null} /></div>
        </form>
      ) : null}
      {runs.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {runs.isError ? <p role="alert" className="surface p-4 text-sm">Pay runs could not be loaded.</p> : null}
      {runs.data && runs.data.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">No pay runs yet.</p> : null}
      <ul className="grid gap-2">
        {(runs.data ?? []).map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => setOpen(r)} className="surface flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              <span><span className="block text-sm font-medium">{monthLabel(r.year, r.month)}</span><span className="block text-xs text-muted-foreground">{r.paidAt ? `Paid ${when(r.paidAt)}` : r.approvedAt ? `Approved ${when(r.approvedAt)}` : r.calculatedAt ? `Calculated ${when(r.calculatedAt)}` : "Not calculated yet"}</span></span>
              <RunStatusChip status={r.status} />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">{open ? <RunDetail key={open.id} run={open} onClose={() => setOpen(null)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}
