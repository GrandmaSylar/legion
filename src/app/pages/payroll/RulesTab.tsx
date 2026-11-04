import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import {
  confirmRules, deleteRule, getPayrollConfig, listRules, newRuleVersion, saveRule,
  type Band, type Rule, type RuleAppliesTo, type RuleBase, type RuleInput, type RuleKind, type RuleMethod,
} from "../../../lib/data/payroll";
import { BASE_LABELS, describeRule } from "../../../lib/payroll";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { useMoney } from "./shared";

const day = (k: string) => new Date(k + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const todayKey = () => new Date().toISOString().slice(0, 10);
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/,/g, "")));

interface BandRow { from: string; to: string; rate: string }
const toRows = (b: Band[]): BandRow[] => (b.length ? b.map((x) => ({ from: String(x.from), to: x.to === null ? "" : String(x.to), rate: String(x.rate) })) : [{ from: "0", to: "", rate: "" }]);
const fromRows = (rows: BandRow[]): Band[] => rows.map((r) => ({ from: Number(r.from || 0), to: r.to.trim() === "" ? null : Number(r.to), rate: Number(r.rate || 0) }));

/** Add or change one rule. The sentence at the bottom says exactly what it will do. */
function RuleForm({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { currency } = useMoney();
  const [f, setF] = useState({
    name: rule?.name ?? "", kind: (rule?.kind ?? "deduction") as RuleKind, method: (rule?.method ?? "percent") as RuleMethod, base: (rule?.base ?? "basic") as RuleBase,
    rate: rule?.rate !== null && rule?.rate !== undefined ? String(rule.rate) : "", fixed: rule?.fixedAmount !== null && rule?.fixedAmount !== undefined ? String(rule.fixedAmount) : "",
    cap: rule?.capBase !== null && rule?.capBase !== undefined ? String(rule.capBase) : "", relief: rule?.reducesTaxable ?? false, sequence: String(rule?.sequence ?? 100),
    appliesTo: (rule?.appliesTo ?? "all") as RuleAppliesTo, from: rule?.effectiveFrom ?? todayKey(), to: rule?.effectiveTo ?? "", active: rule?.active ?? true,
  });
  const [bands, setBands] = useState<BandRow[]>(toRows(rule?.bands ?? []));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((c) => ({ ...c, [k]: v }));
  const input: RuleInput = {
    id: rule?.id, name: f.name, kind: f.kind, method: f.method, base: f.base, rate: num(f.rate), fixedAmount: num(f.fixed), capBase: num(f.cap), reducesTaxable: f.kind === "deduction" && f.relief,
    sequence: Number(f.sequence), appliesTo: f.appliesTo, effectiveFrom: f.from, effectiveTo: f.to || null, active: f.active, bands: fromRows(bands),
  };
  const save = useMutation({ mutationFn: () => saveRule(input), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["payroll-rules"] }); void qc.invalidateQueries({ queryKey: ["payroll-config"] }); onClose(); } });
  const preview = f.name.trim() ? describeRule(input, currency) : "";
  const ready = f.name.trim() && f.from && Number.isInteger(input.sequence) && (f.method !== "percent" || input.rate !== null) && (f.method !== "fixed" || input.fixedAmount !== null);

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>{rule ? "Change rule" : "Add a statutory rule"}</DialogTitle>
        <DialogDescription>Enter the rule exactly as your accountant gives it. Nothing is filled in for you.</DialogDescription>
      </DialogHeader>
      <Field label="Name" htmlFor="ru-name"><Input id="ru-name" value={f.name} maxLength={80} placeholder="e.g. Employee pension contribution" onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Who pays it" htmlFor="ru-kind"><NativeSelect id="ru-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as RuleKind)}><option value="deduction">Taken from the person&apos;s pay</option><option value="employer">Paid by the school (shown, not taken)</option></NativeSelect></Field>
        <Field label="Worked out as" htmlFor="ru-method"><NativeSelect id="ru-method" value={f.method} onChange={(e) => set("method", e.target.value as RuleMethod)}><option value="percent">A percent</option><option value="fixed">A fixed amount each month</option><option value="bands">Slices at different rates (like income tax)</option></NativeSelect></Field>
        <Field label="Worked out from" htmlFor="ru-base"><NativeSelect id="ru-base" value={f.base} onChange={(e) => set("base", e.target.value as RuleBase)}>{(Object.keys(BASE_LABELS) as RuleBase[]).map((b) => <option key={b} value={b}>{BASE_LABELS[b]}</option>)}</NativeSelect></Field>
        <Field label="Applies to" htmlFor="ru-who"><NativeSelect id="ru-who" value={f.appliesTo} onChange={(e) => set("appliesTo", e.target.value as RuleAppliesTo)}><option value="all">All staff</option><option value="teaching">Teaching staff only</option><option value="non_teaching">Non-teaching staff only</option></NativeSelect></Field>
      </div>
      {f.method === "percent" ? <Field label="Rate (percent)" htmlFor="ru-rate"><Input id="ru-rate" className="max-w-40" inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} /></Field> : null}
      {f.method === "fixed" ? <Field label={`Amount each month (${currency})`} htmlFor="ru-fixed"><Input id="ru-fixed" className="max-w-40" inputMode="decimal" value={f.fixed} onChange={(e) => set("fixed", e.target.value)} /></Field> : null}
      {f.method === "bands" ? (
        <fieldset className="space-y-2"><legend className="text-sm font-medium">Slices, from the bottom. Leave the last one&apos;s upper limit empty.</legend>
          {bands.map((b, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2">
              <Field label="From" htmlFor={`bd-f${i}`}><Input id={`bd-f${i}`} inputMode="decimal" value={b.from} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} /></Field>
              <Field label="Up to" htmlFor={`bd-t${i}`}><Input id={`bd-t${i}`} inputMode="decimal" value={b.to} placeholder="no limit" onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} /></Field>
              <Field label="Rate %" htmlFor={`bd-r${i}`}><Input id={`bd-r${i}`} inputMode="decimal" value={b.rate} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} /></Field>
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove slice ${i + 1}`} disabled={bands.length === 1} onClick={() => setBands(bands.filter((_, j) => j !== i))}><Trash2 className="size-4" aria-hidden /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => setBands([...bands, { from: bands[bands.length - 1].to, to: "", rate: "" }])}><Plus className="size-4" aria-hidden /> Add a slice</Button>
        </fieldset>
      ) : null}
      {f.method !== "fixed" ? <Field label="Count at most this much of the pay (optional)" htmlFor="ru-cap"><Input id="ru-cap" className="max-w-40" inputMode="decimal" value={f.cap} placeholder="no limit" onChange={(e) => set("cap", e.target.value)} /></Field> : null}
      {f.kind === "deduction" ? <label className="flex min-h-10 items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-5 accent-[var(--primary)]" checked={f.relief} onChange={(e) => set("relief", e.target.checked)} /><span>This reduces the person&apos;s taxable pay (for a contribution that is allowed before tax). Give it a lower order number than any tax rule.</span></label> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Order" htmlFor="ru-seq"><Input id="ru-seq" type="number" min="1" max="999" inputMode="numeric" value={f.sequence} onChange={(e) => set("sequence", e.target.value)} /></Field>
        <Field label="Starts" htmlFor="ru-from"><Input id="ru-from" type="date" value={f.from} onChange={(e) => set("from", e.target.value)} /></Field>
        <Field label="Ends (optional)" htmlFor="ru-to"><Input id="ru-to" type="date" value={f.to} min={f.from} onChange={(e) => set("to", e.target.value)} /></Field>
      </div>
      <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.active} onChange={(e) => set("active", e.target.checked)} />In use</label>
      {preview ? <p role="note" className="rounded-xl bg-foreground/5 p-3 text-sm"><strong>This rule:</strong> {preview}</p> : null}
      <FormMessage error={save.isError ? friendlyError(save.error) : null} />
      <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" disabled={save.isPending || !ready} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save rule"}</Button></DialogFooter>
    </div>
  );
}

/** A rate changing from a date: the old version ends the day before, so earlier months keep what was true then. */
function VersionForm({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState("");
  const [rate, setRate] = useState("");
  const [fixed, setFixed] = useState("");
  const [bands, setBands] = useState<BandRow[]>(toRows(rule.bands));
  const go = useMutation({
    mutationFn: () => newRuleVersion(rule.id, from, rule.method === "percent" ? num(rate) : null, rule.method === "fixed" ? num(fixed) : null, rule.method === "bands" ? fromRows(bands) : null),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["payroll-rules"] }); void qc.invalidateQueries({ queryKey: ["payroll-config"] }); onClose(); },
  });
  return (
    <div className="space-y-4">
      <DialogHeader><DialogTitle>{rule.name}: a new rate from a date</DialogTitle><DialogDescription>The current version ends the day before. Pay runs for earlier months keep using it.</DialogDescription></DialogHeader>
      <Field label="From" htmlFor="nv-from"><Input id="nv-from" type="date" className="max-w-48" value={from} min={rule.effectiveFrom} onChange={(e) => setFrom(e.target.value)} /></Field>
      {rule.method === "percent" ? <Field label="New rate (percent)" htmlFor="nv-rate"><Input id="nv-rate" className="max-w-40" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field> : null}
      {rule.method === "fixed" ? <Field label="New amount each month" htmlFor="nv-fixed"><Input id="nv-fixed" className="max-w-40" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} /></Field> : null}
      {rule.method === "bands" ? (
        <fieldset className="space-y-2"><legend className="text-sm font-medium">New slices</legend>
          {bands.map((b, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <Input aria-label={`Slice ${i + 1} from`} inputMode="decimal" value={b.from} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} />
              <Input aria-label={`Slice ${i + 1} up to`} inputMode="decimal" placeholder="no limit" value={b.to} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} />
              <Input aria-label={`Slice ${i + 1} rate`} inputMode="decimal" value={b.rate} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))} />
            </div>
          ))}
        </fieldset>
      ) : null}
      <FormMessage error={go.isError ? friendlyError(go.error) : null} />
      <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" disabled={go.isPending || !from || (rule.method === "percent" && num(rate) === null) || (rule.method === "fixed" && num(fixed) === null)} onClick={() => go.mutate()}>{go.isPending ? "Saving" : "Start the new version"}</Button></DialogFooter>
    </div>
  );
}

function Confirmation() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig });
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const confirm = useMutation({ mutationFn: () => confirmRules(name, note), onSuccess: () => { setName(""); setNote(""); void qc.invalidateQueries({ queryKey: ["payroll-config"] }); } });
  if (!config.data) return null;
  const c = config.data;
  if (c.rulesConfirmedAt) {
    return <p role="status" className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /><span>These rules were confirmed by <strong>{c.rulesConfirmedBy}</strong> on {new Date(c.rulesConfirmedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}{c.rulesConfirmedNote ? `: ${c.rulesConfirmedNote}` : ""}. Changing any rule, slice or exemption clears this.</span></p>;
  }
  if (c.activeRules === 0) return <p className="text-sm text-muted-foreground">No statutory rules are set up, so pay runs use only the allowances and deductions you have given each person.</p>;
  return (
    <div className="space-y-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3">
      <p className="flex items-start gap-2 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /><span><strong>Not confirmed.</strong> A pay run that uses these rules cannot be approved until an accountant has checked them and you record who. The app only does the arithmetic it is given; it does not know whether the rates are right.</span></p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Accountant who checked the rules" htmlFor="cf-name"><Input id="cf-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Note (optional)" htmlFor="cf-note"><Input id="cf-note" value={note} maxLength={300} placeholder="e.g. Checked against the 2027 schedule" onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <FormMessage error={confirm.isError ? friendlyError(confirm.error) : null} />
      <Button type="button" size="sm" disabled={confirm.isPending || name.trim().length < 3} onClick={() => confirm.mutate()}>{confirm.isPending ? "Saving" : "Record the confirmation"}</Button>
    </div>
  );
}

/** Statutory deductions and employer costs: rules the school enters, with the date each starts. */
export function RulesTab() {
  const qc = useQueryClient();
  const { currency } = useMoney();
  const rules = useQuery({ queryKey: ["payroll-rules"], queryFn: listRules });
  const [edit, setEdit] = useState<Rule | "new" | null>(null);
  const [version, setVersion] = useState<Rule | null>(null);
  const remove = useMutation({ mutationFn: (id: string) => deleteRule(id), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["payroll-rules"] }); void qc.invalidateQueries({ queryKey: ["payroll-config"] }); } });
  const today = todayKey();
  const groups = useMemo(() => {
    const m = new Map<string, Rule[]>();
    for (const r of rules.data ?? []) m.set(r.name.toLowerCase(), [...(m.get(r.name.toLowerCase()) ?? []), r]);
    return [...m.values()];
  }, [rules.data]);
  const inForce = (r: Rule) => r.active && r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo >= today);

  return (
    <section className="surface space-y-3 p-4" aria-label="Statutory rules">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="max-w-prose"><h2 className="text-base font-medium">Statutory deductions and employer costs</h2>
          <p className="text-sm text-muted-foreground">Pension, income tax and the like. Nothing is built in or filled in: enter each rule as your accountant gives it, with the date it starts. To change a rate, start a new version from a date so earlier months stay as they were. Rules run in order, so put a tax rule after anything that reduces taxable pay.</p></div>
        <Button type="button" size="sm" onClick={() => setEdit("new")}><Plus className="size-4" aria-hidden /> Add a rule</Button>
      </div>
      <Confirmation />
      {rules.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {rules.data && rules.data.length === 0 ? <p className="text-sm text-muted-foreground">No rules yet.</p> : null}
      <ul className="grid gap-3">
        {groups.map((versions) => (
          <li key={versions[0].name} className="space-y-2 rounded-xl border border-border p-3">
            <p className="break-words text-sm font-semibold">{versions[0].name} <span className="text-xs font-normal text-muted-foreground">· order {versions[0].sequence}</span></p>
            <ul className="space-y-2">
              {versions.map((r) => (
                <li key={r.id} className="space-y-1 text-sm">
                  <p className="text-xs text-muted-foreground">{day(r.effectiveFrom)} {r.effectiveTo ? `to ${day(r.effectiveTo)}` : "onwards"}{inForce(r) ? " · in force now" : ""}{r.active ? "" : " · switched off"}</p>
                  <p className="break-words">{describeRule(r, currency)}</p>
                  <div className="flex flex-wrap gap-1">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEdit(r)}>Change</Button>
                    {!r.effectiveTo ? <Button type="button" size="sm" variant="outline" onClick={() => setVersion(r)}>New rate from a date</Button> : null}
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(r.id)}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <FormMessage error={remove.isError ? friendlyError(remove.error) : null} />
      <Dialog open={edit !== null} onOpenChange={(v) => { if (!v) setEdit(null); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">{edit !== null ? <RuleForm key={edit === "new" ? "new" : edit.id} rule={edit === "new" ? null : edit} onClose={() => setEdit(null)} /> : null}</DialogContent></Dialog>
      <Dialog open={version !== null} onOpenChange={(v) => { if (!v) setVersion(null); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">{version ? <VersionForm key={version.id} rule={version} onClose={() => setVersion(null)} /> : null}</DialogContent></Dialog>
    </section>
  );
}
