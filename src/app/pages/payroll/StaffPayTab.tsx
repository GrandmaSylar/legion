import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  addStaffComponent, getPayHistory, getStaffAccount, listComponents, listPayStaff, listStaffComponents, removeStaffComponent, saveStaffAccount, saveStaffPay,
  type PayStaff,
} from "../../../lib/data/payroll";
import { parseAmount } from "../../../lib/payroll";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { useMoney } from "./shared";

const day = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const todayKey = () => new Date().toISOString().slice(0, 10);

function PayForm({ person, canEdit }: { person: PayStaff; canEdit: boolean }) {
  const qc = useQueryClient();
  const { fmt } = useMoney();
  const history = useQuery({ queryKey: ["pay-history", person.staffId], queryFn: () => getPayHistory(person.staffId) });
  const [from, setFrom] = useState(todayKey());
  const [basic, setBasic] = useState("");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () => saveStaffPay(person.staffId, from, parseAmount(basic) ?? 0, note),
    onSuccess: () => { setBasic(""); setNote(""); void qc.invalidateQueries({ queryKey: ["pay-history", person.staffId] }); void qc.invalidateQueries({ queryKey: ["payroll-staff"] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (parseAmount(basic) !== null) save.mutate(); };
  return (
    <section aria-label="Basic pay" className="space-y-2">
      <h3 className="text-sm font-semibold">Basic pay each month</h3>
      {history.data && history.data.length === 0 ? <p className="text-sm text-muted-foreground">No pay set yet. This person is left out of pay runs until it is.</p> : null}
      <ul className="space-y-1 text-sm">
        {(history.data ?? []).map((h, i) => (
          <li key={h.id} className="flex flex-wrap justify-between gap-2"><span>{i === 0 ? "From " : "Before, from "}{day(h.effectiveFrom)}{h.note ? ` · ${h.note}` : ""}</span><span className="tabular-nums">{fmt(h.basic)}</span></li>
        ))}
      </ul>
      {canEdit ? (
        <form onSubmit={submit} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="New basic pay" htmlFor="sp-basic"><Input id="sp-basic" inputMode="decimal" value={basic} onChange={(e) => setBasic(e.target.value)} placeholder="e.g. 2500" /></Field>
          <Field label="From" htmlFor="sp-from"><Input id="sp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Button type="submit" disabled={save.isPending || parseAmount(basic) === null || !from}>{save.isPending ? "Saving" : "Save"}</Button>
          <Input aria-label="Note" className="sm:col-span-3" placeholder="Note (optional), e.g. Annual raise" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          <div className="sm:col-span-3"><FormMessage error={save.isError ? friendlyError(save.error) : null} /></div>
        </form>
      ) : null}
    </section>
  );
}

function Allowances({ person, canEdit }: { person: PayStaff; canEdit: boolean }) {
  const qc = useQueryClient();
  const { fmt } = useMoney();
  const mine = useQuery({ queryKey: ["staff-components", person.staffId], queryFn: () => listStaffComponents(person.staffId) });
  const types = useQuery({ queryKey: ["pay-components"], queryFn: listComponents, staleTime: 60_000 });
  const [comp, setComp] = useState("");
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["staff-components", person.staffId] });
  const add = useMutation({ mutationFn: () => addStaffComponent(person.staffId, comp, parseAmount(amount) ?? 0, from, to), onSuccess: () => { setAmount(""); setTo(""); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => removeStaffComponent(id), onSuccess: refresh });
  const chosen = (types.data ?? []).find((t) => t.id === comp);
  return (
    <section aria-label="Allowances and deductions" className="space-y-2">
      <h3 className="text-sm font-semibold">Allowances and deductions</h3>
      {mine.data && mine.data.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
      <ul className="space-y-1 text-sm">
        {(mine.data ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 break-words">{c.kind === "deduction" ? "Less: " : ""}{c.name} · from {day(c.effectiveFrom)}{c.effectiveTo ? ` to ${day(c.effectiveTo)}` : ""}</span>
            <span className="flex shrink-0 items-center gap-1 tabular-nums">
              {c.calc === "percent_of_basic" ? `${c.amount}% of basic` : fmt(c.amount)}
              {canEdit ? <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${c.name}`} disabled={remove.isPending} onClick={() => remove.mutate(c.id)}><Trash2 className="size-4" aria-hidden /></Button> : null}
            </span>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
          <NativeSelect aria-label="Type" value={comp} onChange={(e) => setComp(e.target.value)}>
            <option value="">Choose a type</option>
            {(types.data ?? []).filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind === "earning" ? "added" : "taken off"}, {t.calc === "fixed" ? "fixed amount" : "% of basic"})</option>)}
          </NativeSelect>
          <Input aria-label={chosen?.calc === "percent_of_basic" ? "Percent" : "Amount"} placeholder={chosen?.calc === "percent_of_basic" ? "Percent of basic, e.g. 2" : "Amount each month"} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Field label="From" htmlFor="al-from"><Input id="al-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Until (optional)" htmlFor="al-to"><Input id="al-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
          <div className="sm:col-span-2"><Button type="button" size="sm" disabled={add.isPending || !comp || parseAmount(amount) === null || !from} onClick={() => add.mutate()}>{add.isPending ? "Adding" : "Add"}</Button></div>
          <div className="sm:col-span-2"><FormMessage error={add.isError ? friendlyError(add.error) : remove.isError ? friendlyError(remove.error) : null} /></div>
        </div>
      ) : null}
    </section>
  );
}

function Account({ person, canEdit }: { person: PayStaff; canEdit: boolean }) {
  const qc = useQueryClient();
  const acct = useQuery({ queryKey: ["staff-account", person.staffId], queryFn: () => getStaffAccount(person.staffId) });
  const [f, setF] = useState<{ bankName: string; accountName: string; accountNo: string; ssnitNo: string; tinNo: string } | null>(null);
  const v = f ?? { bankName: acct.data?.bankName ?? "", accountName: acct.data?.accountName ?? "", accountNo: acct.data?.accountNo ?? "", ssnitNo: acct.data?.ssnitNo ?? "", tinNo: acct.data?.tinNo ?? "" };
  const set = (k: keyof typeof v, x: string) => setF({ ...v, [k]: x });
  const save = useMutation({
    mutationFn: () => saveStaffAccount(person.staffId, v),
    onSuccess: () => { setF(null); void qc.invalidateQueries({ queryKey: ["staff-account", person.staffId] }); void qc.invalidateQueries({ queryKey: ["payroll-staff"] }); },
  });
  if (acct.isLoading) return <Skeleton className="h-20 w-full" />;
  return (
    <section aria-label="Bank and tax details" className="space-y-2">
      <h3 className="text-sm font-semibold">Bank and tax details</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Bank" htmlFor="ac-bank"><Input id="ac-bank" value={v.bankName} disabled={!canEdit} maxLength={80} onChange={(e) => set("bankName", e.target.value)} /></Field>
        <Field label="Name on the account" htmlFor="ac-name"><Input id="ac-name" value={v.accountName} disabled={!canEdit} maxLength={120} onChange={(e) => set("accountName", e.target.value)} /></Field>
        <Field label="Account number" htmlFor="ac-no"><Input id="ac-no" value={v.accountNo} disabled={!canEdit} maxLength={40} inputMode="numeric" onChange={(e) => set("accountNo", e.target.value)} /></Field>
        <Field label="Social security number" htmlFor="ac-ssnit"><Input id="ac-ssnit" value={v.ssnitNo} disabled={!canEdit} maxLength={40} onChange={(e) => set("ssnitNo", e.target.value)} /></Field>
        <Field label="Tax identification number" htmlFor="ac-tin"><Input id="ac-tin" value={v.tinNo} disabled={!canEdit} maxLength={40} onChange={(e) => set("tinNo", e.target.value)} /></Field>
      </div>
      {canEdit ? (
        <>
          <FormMessage error={save.isError ? friendlyError(save.error) : null} ok={save.isSuccess && !f ? "Saved." : null} />
          <Button type="button" size="sm" disabled={save.isPending || !f} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save details"}</Button>
        </>
      ) : null}
    </section>
  );
}

/** Each member of staff's pay: basic pay with the date it starts, allowances and deductions, bank and tax details. */
export function StaffPayTab() {
  const { can } = useCapabilities();
  const { fmt } = useMoney();
  const staff = useQuery({ queryKey: ["payroll-staff"], queryFn: listPayStaff, staleTime: 15_000 });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<PayStaff | null>(null);
  const canEdit = can("payroll.manage_pay");
  const rows = useMemo(() => (staff.data ?? []).filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())), [staff.data, q]);
  const without = (staff.data ?? []).filter((s) => s.basic === null && s.status === "active").length;
  return (
    <div className="space-y-3">
      <Input aria-label="Search staff" placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
      {without > 0 ? <p role="status" className="text-sm text-amber-800 dark:text-amber-200">{without} {without === 1 ? "member of staff has" : "members of staff have"} no pay details and will be left out of pay runs.</p> : null}
      {staff.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {staff.isError ? <p role="alert" className="surface p-4 text-sm">{friendlyError(staff.error)}</p> : null}
      <ul className="grid gap-2">
        {rows.map((s) => (
          <li key={s.staffId}>
            <button type="button" onClick={() => setOpen(s)} className="surface flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{s.name}</span>
                <span className="block break-words text-xs text-muted-foreground">{s.job ?? ""}{s.status !== "active" ? ` · ${s.status.replace("_", " ")}` : ""}{s.hasAccount ? "" : " · no bank details"}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums">{s.basic === null ? <span className="text-muted-foreground">No pay set</span> : fmt(s.basic)}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
          {open ? (
            <div className="space-y-5" key={open.staffId}>
              <DialogHeader><DialogTitle className="break-words">{open.name}</DialogTitle><DialogDescription>{open.job ?? "Staff"}{open.staffNo ? ` · ${open.staffNo}` : ""}</DialogDescription></DialogHeader>
              <PayForm person={open} canEdit={canEdit} />
              <Allowances person={open} canEdit={canEdit} />
              <Account person={open} canEdit={canEdit} />
              <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(null)}>Close</Button></DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
