import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  FEEDS_LABELS, METHOD_LABELS, MISSING_LABELS, PRESETS, deleteScheme, describePart, listAssignments, listSchemes, saveScheme,
  setClassScheme, setLevelScheme, type PartFeeds, type PartInput, type PartMethod, type PartMissing, type Scheme,
} from "../../../lib/data/schemes";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";

const PART_COLOURS = ["bg-sky-500", "bg-emerald-500", "bg-amber-500", "bg-violet-500", "bg-rose-500", "bg-cyan-500", "bg-orange-500", "bg-lime-500", "bg-fuchsia-500", "bg-teal-500"];

function ShareBar({ parts }: { parts: { name: string; weight: number }[] }) {
  return (
    <div className="space-y-1.5" role="img" aria-label={parts.map((p) => `${p.name} ${p.weight} percent`).join(", ")}>
      <div className="flex h-3 overflow-hidden rounded-full bg-foreground/10">
        {parts.map((p, i) => <div key={i} className={PART_COLOURS[i % PART_COLOURS.length]} style={{ width: `${Math.max(0, Math.min(100, p.weight))}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {parts.map((p, i) => (
          <li key={i} className="flex items-center gap-1.5"><span className={cn("size-2 rounded-full", PART_COLOURS[i % PART_COLOURS.length])} aria-hidden />{p.name} {p.weight}%</li>
        ))}
      </ul>
    </div>
  );
}

/** Schemes: how a school's marks add up to a result, and which levels and classes use which scheme. */
export default function SchemesTab() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const canManage = can("grades.manage_assessment_schemes");
  const schemes = useQuery({ queryKey: ["assessment-schemes"], queryFn: listSchemes });
  const assignments = useQuery({ queryKey: ["scheme-assignments"], queryFn: listAssignments });
  const [editing, setEditing] = useState<Scheme | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["assessment-schemes"] });
    void qc.invalidateQueries({ queryKey: ["scheme-assignments"] });
    void qc.invalidateQueries({ queryKey: ["class-scheme"] });
    void qc.invalidateQueries({ queryKey: ["subject-gradebook"] });
    void qc.invalidateQueries({ queryKey: ["broadsheet"] });
  };
  const assign = useMutation({
    mutationFn: (v: { kind: "level" | "class"; id: string; schemeId: string | null }) =>
      v.kind === "level" ? setLevelScheme(v.id, v.schemeId) : setClassScheme(v.id, v.schemeId),
    onSuccess: () => { setMessage("Saved. Results for the classes affected have been recalculated."); refresh(); },
    onError: () => setMessage(null),
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteScheme(id), onSuccess: refresh });

  const usedBy = useMemo(() => {
    const out = new Map<string, string[]>();
    const a = assignments.data;
    if (!a) return out;
    for (const l of a.levels) if (l.schemeId) out.set(l.schemeId, [...(out.get(l.schemeId) ?? []), l.name]);
    for (const c of a.classes) if (c.schemeId) out.set(c.schemeId, [...(out.get(c.schemeId) ?? []), c.label]);
    return out;
  }, [assignments.data]);

  const list = schemes.data ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">How marks add up</h2>
          <p className="text-sm text-muted-foreground">
            A scheme is the list of parts that make a term result, such as class work, tests and the exam, with each part&apos;s share of 100 and how its marks are combined.
            A level or class with no scheme counts marks the original way: each assessment carries its own points.
          </p>
        </div>
        {canManage ? <Button type="button" size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> New scheme</Button> : null}
      </div>

      {schemes.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {schemes.isError ? <p role="alert" className="surface p-4 text-sm">Schemes could not be loaded.</p> : null}
      {schemes.data && list.length === 0 ? <p className="surface p-6 text-sm text-muted-foreground">No schemes yet.{canManage ? " Press New scheme to build one, or start from the Ghana standard." : ""}</p> : null}
      <FormMessage error={remove.isError ? friendlyError(remove.error) : null} />

      <ul className="grid gap-3">
        {list.map((s) => (
          <li key={s.id} className="surface space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold">{s.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {(usedBy.get(s.id) ?? []).length > 0 ? `Used by ${(usedBy.get(s.id) ?? []).join(", ")}` : "Not used yet"}
                </p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing(s)}>Edit</Button>
                  <Button
                    type="button" size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${s.name}`}
                    disabled={remove.isPending || (usedBy.get(s.id) ?? []).length > 0} title={(usedBy.get(s.id) ?? []).length > 0 ? "Take it away from the levels and classes using it first" : undefined}
                    onClick={() => remove.mutate(s.id)}
                  ><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              ) : null}
            </div>
            <ShareBar parts={s.parts} />
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {s.parts.map((p) => <li key={p.id}><strong className="font-medium text-foreground">{p.name}</strong> counts as {FEEDS_LABELS[p.feeds].toLowerCase()}. {describePart(p)}</li>)}
            </ul>
          </li>
        ))}
      </ul>

      <section className="surface space-y-4 p-4" aria-label="Who uses which scheme">
        <div>
          <h3 className="text-base font-medium">Who uses which scheme</h3>
          <p className="text-xs text-muted-foreground">Choose a scheme for each level. A class can use a different one. Changing this recalculates the results of the classes it touches straight away, and marks are never lost.</p>
        </div>
        {assignments.isLoading ? <Skeleton className="h-20 w-full" /> : null}
        <FormMessage error={assign.isError ? friendlyError(assign.error) : null} ok={message} />
        <ul className="grid gap-3 sm:grid-cols-2">
          {(assignments.data?.levels ?? []).map((l) => (
            <li key={l.id}>
              <Field label={l.name} htmlFor={`lv-${l.id}`}>
                <NativeSelect id={`lv-${l.id}`} value={l.schemeId ?? ""} disabled={!canManage || assign.isPending}
                  onChange={(e) => assign.mutate({ kind: "level", id: l.id, schemeId: e.target.value || null })}>
                  <option value="">Original way (points per assessment)</option>
                  {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </NativeSelect>
              </Field>
            </li>
          ))}
        </ul>
        {(assignments.data?.classes ?? []).length > 0 ? (
          <details>
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              A class that differs from its level <span className="text-xs font-normal text-muted-foreground">({(assignments.data?.classes ?? []).filter((c) => c.schemeId).length} set)</span>
            </summary>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {(assignments.data?.classes ?? []).map((c) => (
                <li key={c.id}>
                  <Field label={c.label} htmlFor={`cl-${c.id}`}>
                    <NativeSelect id={`cl-${c.id}`} value={c.schemeId ?? ""} disabled={!canManage || assign.isPending}
                      onChange={(e) => assign.mutate({ kind: "class", id: c.id, schemeId: e.target.value || null })}>
                      <option value="">Same as its level</option>
                      {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </NativeSelect>
                  </Field>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <SchemeDialog key={editing === null ? "none" : editing === "new" ? "new" : editing.id} open={editing !== null} scheme={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)} onSaved={refresh} />
    </div>
  );
}

/** One part as it is edited on screen: numbers are kept as typed text until they are saved. */
interface Row { key: string; id?: string; name: string; feeds: PartFeeds; weight: string; method: PartMethod; bestN: string; missing: PartMissing }

let rowKey = 0;
const toRow = (p: { id?: string; name: string; feeds: PartFeeds; weight: number; method: PartMethod; bestN?: number | null; missing: PartMissing }): Row => ({
  key: `r${++rowKey}`, id: p.id, name: p.name, feeds: p.feeds, weight: String(p.weight), method: p.method, bestN: p.bestN ? String(p.bestN) : "3", missing: p.missing,
});

function SchemeDialog({ open, scheme, onClose, onSaved }: { open: boolean; scheme: Scheme | null; onClose: () => void; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {open ? <SchemeForm scheme={scheme} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function SchemeForm({ scheme, onClose, onSaved }: { scheme: Scheme | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(scheme?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => scheme ? scheme.parts.map((p) => toRow(p)) : PRESETS[0].parts.map((p) => toRow(p)));
  const total = rows.reduce((n, r) => n + (Number(r.weight) || 0), 0);
  const save = useMutation({
    mutationFn: () => saveScheme({
      id: scheme?.id, name, description: "",
      parts: rows.map((r) => ({ id: r.id, name: r.name, feeds: r.feeds, weight: Number(r.weight), method: r.method, bestN: Number(r.bestN) || null, missing: r.missing })),
    }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  const set = (key: string, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const problem =
    !name.trim() ? "Give the scheme a name."
    : rows.some((r) => !r.name.trim()) ? "Every part needs a name."
    : rows.some((r) => !(Number(r.weight) > 0)) ? "Every part needs a share above zero."
    : Math.round(total * 100) !== 10000 ? `The shares must add up to 100. They add up to ${Math.round(total * 100) / 100}.`
    : new Set(rows.map((r) => r.name.trim().toLowerCase())).size !== rows.length ? "Two parts have the same name."
    : rows.some((r) => r.method === "best_n" && !(Number(r.bestN) >= 1)) ? "Say how many of the best marks to count."
    : null;

  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  const preview = rows.map((r) => ({ name: r.name || "Untitled", weight: Number(r.weight) || 0 }));

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{scheme ? "Change scheme" : "New scheme"}</DialogTitle>
        <DialogDescription>Decide the parts of a term result, their shares of 100, and how the marks inside each part combine.</DialogDescription>
      </DialogHeader>

      {!scheme ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Start from</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => { setRows(p.parts.map((x) => toRow(x))); if (!name.trim() && p.key !== "custom") setName(p.label); }}
                className="min-h-12 rounded-xl border border-border px-3 py-2 text-left text-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                <span className="block font-medium">{p.label}</span><span className="block text-xs text-muted-foreground">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <Field label="Name of the scheme" htmlFor="sch-name">
        <Input id="sch-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Primary 30 / 70" required />
      </Field>

      <ShareBar parts={preview} />

      <ul className="space-y-3" aria-label="Parts">
        {rows.map((r, i) => (
          <li key={r.key} className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field label={`Part ${i + 1}`} htmlFor={`pn-${r.key}`}>
                <Input id={`pn-${r.key}`} value={r.name} maxLength={40} onChange={(e) => set(r.key, { name: e.target.value })} placeholder="e.g. Class work" />
              </Field>
              <Field label="Share %" htmlFor={`pw-${r.key}`}>
                <Input id={`pw-${r.key}`} type="number" min="1" max="100" step="any" inputMode="decimal" value={r.weight} onChange={(e) => set(r.key, { weight: e.target.value })} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Counts as" htmlFor={`pf-${r.key}`}>
                <NativeSelect id={`pf-${r.key}`} value={r.feeds} onChange={(e) => set(r.key, { feeds: e.target.value as PartFeeds })}>
                  {(Object.keys(FEEDS_LABELS) as PartFeeds[]).map((f) => <option key={f} value={f}>{FEEDS_LABELS[f]}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Marks are combined by" htmlFor={`pm-${r.key}`}>
                <NativeSelect id={`pm-${r.key}`} value={r.method} onChange={(e) => set(r.key, { method: e.target.value as PartMethod })}>
                  {(Object.keys(METHOD_LABELS) as PartMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
                </NativeSelect>
              </Field>
              {r.method === "best_n" ? (
                <Field label="How many of the best marks" htmlFor={`pb-${r.key}`}>
                  <Input id={`pb-${r.key}`} type="number" min="1" max="20" inputMode="numeric" value={r.bestN} onChange={(e) => set(r.key, { bestN: e.target.value })} />
                </Field>
              ) : null}
              <Field label="A pupil's missing mark" htmlFor={`pz-${r.key}`}>
                <NativeSelect id={`pz-${r.key}`} value={r.missing} onChange={(e) => set(r.key, { missing: e.target.value as PartMissing })}>
                  {(Object.keys(MISSING_LABELS) as PartMissing[]).map((m) => <option key={m} value={m}>{MISSING_LABELS[m]}</option>)}
                </NativeSelect>
              </Field>
            </div>
            {rows.length > 1 ? (
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}>
                <Trash2 className="size-4" aria-hidden /> Remove this part
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length < 10 ? (
        <Button type="button" size="sm" variant="outline" onClick={() => setRows((cur) => [...cur, toRow({ name: "", feeds: "ca", weight: 0, method: "average", missing: "skip" })])}>
          <Plus className="size-4" aria-hidden /> Add a part
        </Button>
      ) : null}

      <p role="status" className={cn("text-sm tabular-nums", Math.round(total * 100) === 10000 ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300")}>
        Shares add up to {Math.round(total * 100) / 100} of 100{Math.round(total * 100) === 10000 ? ". Good." : "."}
      </p>
      <FormMessage error={problem && (name || rows.some((r) => r.name)) ? problem : save.isError ? friendlyError(save.error) : null} />
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={save.isPending || !!problem}>{save.isPending ? "Saving" : "Save scheme"}</Button>
      </DialogFooter>
    </form>
  );
}
