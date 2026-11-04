import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  deleteComponent, deleteStep, getPayrollConfig, listApproverChoices, listComponents, listSteps, saveComponent, savePayrollProration, savePayrollSettings, saveStep, type Component, type ProrateMethod,
} from "../../../lib/data/payroll";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { RulesTab } from "./RulesTab";

function Components() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["pay-components"], queryFn: listComponents });
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Component["kind"]>("earning");
  const [calc, setCalc] = useState<Component["calc"]>("fixed");
  const [taxable, setTaxable] = useState(true);
  const [pensionable, setPensionable] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["pay-components"] });
  const add = useMutation({ mutationFn: () => saveComponent({ name, kind, calc, taxable, pensionable }), onSuccess: () => { setName(""); refresh(); } });
  const toggle = useMutation({ mutationFn: (c: Component) => saveComponent({ ...c, active: !c.active }), onSuccess: refresh });
  const toggleFlag = useMutation({ mutationFn: (c: Component) => saveComponent(c), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => deleteComponent(id), onSuccess: refresh });
  const err = add.isError ? friendlyError(add.error) : toggle.isError ? friendlyError(toggle.error) : toggleFlag.isError ? friendlyError(toggleFlag.error) : remove.isError ? "That type is given to someone, so it cannot be deleted. Switch it off instead." : null;
  return (
    <section className="surface space-y-3 p-4">
      <div><h2 className="text-base font-medium">Allowances and deductions</h2><p className="text-sm text-muted-foreground">The kinds of extra pay and money taken off that this school uses, such as a transport allowance or a welfare contribution. Give each to the people who get it under Staff pay. Statutory deductions are set up further down.</p></div>
      {list.isLoading ? <Skeleton className="h-10 w-full" /> : null}
      {list.data && list.data.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : null}
      <ul className="grid gap-2">
        {(list.data ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <span className="min-w-0"><span className="block break-words font-medium">{c.name}</span><span className="block text-xs text-muted-foreground">{c.kind === "earning" ? "Added to pay" : "Taken from pay"} · {c.calc === "fixed" ? "a fixed amount" : "a percent of basic pay"}{c.active ? "" : " · switched off"}</span>
              {c.kind === "earning" ? (
                <span className="mt-1 flex flex-wrap gap-x-4">
                  <label className="flex min-h-8 items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={c.taxable} onChange={() => toggleFlag.mutate({ ...c, taxable: !c.taxable })} />Counts as taxable pay</label>
                  <label className="flex min-h-8 items-center gap-2 text-xs"><input type="checkbox" className="size-4 accent-[var(--primary)]" checked={c.pensionable} onChange={() => toggleFlag.mutate({ ...c, pensionable: !c.pensionable })} />Counts as pensionable pay</label>
                </span>
              ) : null}</span>
            <span className="flex shrink-0 items-center gap-2">
              <Switch checked={c.active} onCheckedChange={() => toggle.mutate(c)} aria-label={`${c.name}: ${c.active ? "on" : "off"}`} />
              <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${c.name}`} disabled={remove.isPending} onClick={() => remove.mutate(c.id)}><Trash2 className="size-4" aria-hidden /></Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[1fr_11rem_11rem_auto] sm:items-end">
        <Field label="Name" htmlFor="co-name"><Input id="co-name" value={name} maxLength={60} placeholder="e.g. Transport allowance" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Is it" htmlFor="co-kind"><NativeSelect id="co-kind" value={kind} onChange={(e) => setKind(e.target.value as Component["kind"])}><option value="earning">Added to pay</option><option value="deduction">Taken from pay</option></NativeSelect></Field>
        <Field label="Worked out as" htmlFor="co-calc"><NativeSelect id="co-calc" value={calc} onChange={(e) => setCalc(e.target.value as Component["calc"])}><option value="fixed">A fixed amount</option><option value="percent_of_basic">A percent of basic</option></NativeSelect></Field>
        <Button type="button" disabled={add.isPending || !name.trim()} onClick={() => add.mutate()}>{add.isPending ? "Adding" : "Add"}</Button>
      </div>
      {kind === "earning" ? (
        <div className="flex flex-wrap gap-x-4">
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} />Counts as taxable pay</label>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={pensionable} onChange={(e) => setPensionable(e.target.checked)} />Counts as pensionable pay</label>
        </div>
      ) : null}
      <FormMessage error={err} />
    </section>
  );
}

function Steps() {
  const qc = useQueryClient();
  const steps = useQuery({ queryKey: ["payroll-steps"], queryFn: listSteps });
  const people = useQuery({ queryKey: ["payroll-approvers"], queryFn: listApproverChoices, staleTime: 60_000 });
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["payroll-steps"] });
  const nextPos = (steps.data?.[steps.data.length - 1]?.position ?? 0) + 1;
  const add = useMutation({ mutationFn: () => saveStep({ position: nextPos, label, approvers: picked }), onSuccess: () => { setLabel(""); setPicked([]); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => deleteStep(id), onSuccess: refresh });
  const name = (id: string) => people.data?.find((p) => p.id === id)?.name ?? "Someone";
  return (
    <section className="surface space-y-3 p-4">
      <div><h2 className="text-base font-medium">Who signs a pay run off</h2><p className="text-sm text-muted-foreground">Steps are signed in order. One signature from any person named at a step completes it. With no steps, any one person who may approve pay runs can sign. The person who calculated a pay run cannot sign it, unless you switch that off below.</p></div>
      {steps.data && steps.data.length === 0 ? <p className="text-sm text-muted-foreground">No steps: one signature from anyone who may approve is enough.</p> : null}
      <ol className="grid gap-2">
        {(steps.data ?? []).map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <span className="min-w-0"><span className="block break-words font-medium">{s.position}. {s.label}</span><span className="block break-words text-xs text-muted-foreground">{s.approvers.map(name).join(", ")}</span></span>
            <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Delete step ${s.label}`} disabled={remove.isPending} onClick={() => remove.mutate(s.id)}><Trash2 className="size-4" aria-hidden /></Button>
          </li>
        ))}
      </ol>
      <div className="space-y-2 rounded-xl border border-border p-3">
        <Field label={`Step ${nextPos}: what it is called`} htmlFor="st-label"><Input id="st-label" value={label} maxLength={60} placeholder="e.g. The head's approval" onChange={(e) => setLabel(e.target.value)} /></Field>
        <fieldset className="space-y-1"><legend className="text-sm font-medium">Who can sign it</legend>
          {(people.data ?? []).map((p) => (
            <label key={p.id} className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />{p.name}</label>
          ))}
          {people.data && people.data.length === 0 ? <p className="text-xs text-muted-foreground">Nobody holds the approve action yet. Give it under Users.</p> : null}
        </fieldset>
        <Button type="button" size="sm" disabled={add.isPending || !label.trim() || picked.length === 0} onClick={() => add.mutate()}>{add.isPending ? "Adding" : "Add step"}</Button>
      </div>
      <FormMessage error={add.isError ? friendlyError(add.error) : remove.isError ? friendlyError(remove.error) : null} />
    </section>
  );
}

const PRORATE: { value: ProrateMethod; label: string; help: string }[] = [
  { value: "none", label: "Pay the whole month", help: "Everyone paid in this pay run gets a full month at the pay in force on its last day. Someone who left part-way through is not paid, and a raise counts for the whole month." },
  { value: "calendar_days", label: "Share pay by calendar days", help: "Someone who started or left part-way through the month is paid for the days they were employed, every day counted. A raise pays each rate for the days it was in force." },
  { value: "working_days", label: "Share pay by working days", help: "The same, but counting only Monday to Friday. Public holidays are not taken out." },
];

function Proration() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig });
  const save = useMutation({ mutationFn: (m: ProrateMethod) => savePayrollProration(m), onSuccess: () => void qc.invalidateQueries({ queryKey: ["payroll-config"] }) });
  if (config.isLoading || !config.data) return <Skeleton className="h-20 w-full" />;
  const current = config.data.prorateMethod;
  return (
    <section className="surface space-y-3 p-4">
      <div><h2 className="text-base font-medium">Part-months</h2><p className="text-sm text-muted-foreground">How to pay someone who started or left part-way through a month, or whose pay changed part-way through. Set each person&apos;s start and leaving dates on their Staff pay screen. A pay run that is still being prepared uses the choice when you calculate it again; one that has been approved is never changed.</p></div>
      <div role="radiogroup" aria-label="Part-months" className="grid gap-2">
        {PRORATE.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={current === m.value} disabled={save.isPending} onClick={() => save.mutate(m.value)}
            className={`rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${current === m.value ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}>
            <span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-muted-foreground">{m.help}</span>
          </button>
        ))}
      </div>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} />
    </section>
  );
}

function Settings() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig });
  const [separate, setSeparate] = useState<boolean | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const sep = separate ?? config.data?.requireSeparateApprover ?? true;
  const cur = currency ?? config.data?.currency ?? "GHS";
  const save = useMutation({ mutationFn: () => savePayrollSettings(sep, cur), onSuccess: () => { setSeparate(null); setCurrency(null); void qc.invalidateQueries({ queryKey: ["payroll-config"] }); } });
  const dirty = separate !== null || currency !== null;
  if (config.isLoading) return <Skeleton className="h-20 w-full" />;
  return (
    <section className="surface space-y-3 p-4">
      <h2 className="text-base font-medium">Settings</h2>
      <Field label="Currency" htmlFor="ps-cur"><Input id="ps-cur" className="max-w-32" value={cur} maxLength={8} onChange={(e) => setCurrency(e.target.value)} /></Field>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0"><label htmlFor="ps-sep" className="block text-sm font-medium">The person who calculates cannot approve</label><p className="text-xs text-muted-foreground">Keeps one person from preparing and signing off the same pay run. Recommended.</p></div>
        <Switch id="ps-sep" checked={sep} onCheckedChange={setSeparate} aria-label={`The person who calculates cannot approve: ${sep ? "on" : "off"}`} />
      </div>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} ok={save.isSuccess && !dirty ? "Saved." : null} />
      <Button type="button" disabled={save.isPending || !dirty} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save"}</Button>
    </section>
  );
}

export function SetupTab() {
  return <div className="space-y-4"><Components /><RulesTab /><Proration /><Steps /><Settings /></div>;
}
