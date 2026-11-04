import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { deleteRota, saveRotaAndGenerate, type Rota, type Staffer } from "../../../lib/data/tasks";
import { KIND_LABELS, rotaPlan, whenLabel, type TaskKind } from "../../../lib/tasks";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { todayKey } from "./TaskRow";

const KINDS = Object.keys(KIND_LABELS) as TaskKind[];
const DAYS = [{ n: 1, label: "Mon" }, { n: 2, label: "Tue" }, { n: 3, label: "Wed" }, { n: 4, label: "Thu" }, { n: 5, label: "Fri" }];

/** Create or change a rota (a duty people take turns at), and lay it out as tasks. */
export function RotaDialog({ open, onClose, rota, staff }: { open: boolean; onClose: () => void; rota: Rota | null; staff: Staffer[] }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {open ? <Form key={rota?.id ?? "new"} rota={rota} staff={staff} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Form({ rota, staff, onClose }: { rota: Rota | null; staff: Staffer[]; onClose: () => void }) {
  const qc = useQueryClient();
  const today = todayKey();
  const [f, setF] = useState(() => ({
    title: rota?.title ?? "", description: rota?.description ?? "", kind: (rota?.kind ?? "duty") as TaskKind,
    weekdays: rota?.weekdays ?? [1, 2, 3, 4, 5], startsAt: rota?.startsAt?.slice(0, 5) ?? "", endsAt: rota?.endsAt?.slice(0, 5) ?? "",
    location: rota?.location ?? "", rotation: (rota?.rotation ?? "weekly") as "daily" | "weekly", perSlot: String(rota?.perSlot ?? 1),
    startsOn: rota?.startsOn ?? today, endsOn: rota?.endsOn ?? today, people: rota?.people ?? ([] as string[]),
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((c) => ({ ...c, [k]: v }));
  const nameOf = (id: string) => staff.find((s) => s.id === id)?.name ?? "Someone";
  const remaining = staff.filter((s) => !f.people.includes(s.id));
  const move = (i: number, by: number) => setF((c) => {
    const next = [...c.people];
    const j = i + by;
    if (j < 0 || j >= next.length) return c;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...c, people: next };
  });

  const done = () => { void qc.invalidateQueries({ queryKey: ["tasks"] }); void qc.invalidateQueries({ queryKey: ["task-rotas"] }); };
  const save = useMutation({
    mutationFn: () => saveRotaAndGenerate({ ...f, id: rota?.id, perSlot: Number(f.perSlot) }),
    onSuccess: (n) => { done(); setMade(n); },
  });
  const [made, setMade] = useState<number | null>(null);
  const remove = useMutation({ mutationFn: () => deleteRota(rota!.id), onSuccess: () => { done(); onClose(); } });

  const per = Number(f.perSlot);
  const plan = useMemo(
    () => rotaPlan({ weekdays: f.weekdays, rotation: f.rotation, perSlot: per, startsOn: f.startsOn, endsOn: f.endsOn, people: f.people }).filter((d) => d.date >= today),
    [f.weekdays, f.rotation, per, f.startsOn, f.endsOn, f.people, today],
  );

  const problem =
    !f.title.trim() ? "Give the rota a title."
    : f.weekdays.length === 0 ? "Choose at least one weekday."
    : f.people.length === 0 ? "Choose who takes turns."
    : !(per >= 1 && per <= 5) ? "Choose between 1 and 5 people a day."
    : per > f.people.length ? "You cannot put more people on a day than are in the rota."
    : f.endsOn < f.startsOn ? "The rota cannot end before it starts."
    : f.endsAt && !f.startsAt ? "Add a start time, or clear the end time."
    : null;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  const err = save.isError ? friendlyError(save.error) : remove.isError ? friendlyError(remove.error) : null;

  if (made !== null) {
    return (
      <div className="space-y-4">
        <DialogHeader>
          <DialogTitle>Rota saved</DialogTitle>
          <DialogDescription>{made === 0 ? "No new days were needed." : `${made} ${made === 1 ? "day was" : "days were"} laid out as tasks, and each person has been told.`}</DialogDescription>
        </DialogHeader>
        <DialogFooter><Button type="button" onClick={onClose}>Done</Button></DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{rota ? "Change rota" : "New rota"}</DialogTitle>
        <DialogDescription>A duty that people take turns at, laid out as tasks from today. Past days and anything already ticked off are kept.</DialogDescription>
      </DialogHeader>

      <Field label="Title" htmlFor="rt-title">
        <Input id="rt-title" value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Morning gate duty" required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="rt-kind">
          <NativeSelect id="rt-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as TaskKind)}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</NativeSelect>
        </Field>
        <Field label="Where (optional)" htmlFor="rt-where"><Input id="rt-where" value={f.location} maxLength={80} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="From (optional)" htmlFor="rt-from"><Input id="rt-from" type="time" value={f.startsAt} onChange={(e) => setF((c) => ({ ...c, startsAt: e.target.value, endsAt: e.target.value ? c.endsAt : "" }))} /></Field>
        <Field label="Until (optional)" htmlFor="rt-until"><Input id="rt-until" type="time" value={f.endsAt} disabled={!f.startsAt} onChange={(e) => set("endsAt", e.target.value)} /></Field>
        <Field label="First day" htmlFor="rt-start"><Input id="rt-start" type="date" value={f.startsOn} onChange={(e) => setF((c) => ({ ...c, startsOn: e.target.value, endsOn: c.endsOn < e.target.value ? e.target.value : c.endsOn }))} required /></Field>
        <Field label="Last day" htmlFor="rt-end"><Input id="rt-end" type="date" value={f.endsOn} min={f.startsOn} onChange={(e) => set("endsOn", e.target.value)} required /></Field>
      </div>

      <div role="group" aria-label="Weekdays" className="space-y-2">
        <p className="text-sm font-medium">On these days</p>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((d) => (
            <button
              key={d.n} type="button" role="checkbox" aria-checked={f.weekdays.includes(d.n)}
              onClick={() => set("weekdays", f.weekdays.includes(d.n) ? f.weekdays.filter((x) => x !== d.n) : [...f.weekdays, d.n].sort())}
              className={cn("min-h-10 min-w-14 rounded-full border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]", f.weekdays.includes(d.n) ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5")}
            >{d.label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="People take turns" htmlFor="rt-rotation">
          <NativeSelect id="rt-rotation" value={f.rotation} onChange={(e) => set("rotation", e.target.value as "daily" | "weekly")}>
            <option value="weekly">A new person each week</option>
            <option value="daily">A new person each day</option>
          </NativeSelect>
        </Field>
        <Field label="People on duty at once" htmlFor="rt-per">
          <Input id="rt-per" type="number" min="1" max="5" inputMode="numeric" value={f.perSlot} onChange={(e) => set("perSlot", e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Who takes part, in order <span className="font-normal text-muted-foreground">({f.people.length})</span></p>
        <ol className="space-y-1.5">
          {f.people.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm">
              <span className="w-5 text-xs tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 break-words">{nameOf(id)}</span>
              <Button type="button" size="icon" variant="ghost" aria-label={`Move ${nameOf(id)} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label={`Move ${nameOf(id)} down`} disabled={i === f.people.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
              <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${nameOf(id)}`} onClick={() => set("people", f.people.filter((x) => x !== id))}><Trash2 className="size-4" aria-hidden /></Button>
            </li>
          ))}
        </ol>
        <NativeSelect aria-label="Add a person" value="" onChange={(e) => e.target.value && set("people", [...f.people, e.target.value])}>
          <option value="">Add a person…</option>
          {remaining.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </div>

      <Field label="Notes (optional)" htmlFor="rt-notes"><Textarea id="rt-notes" rows={2} value={f.description} maxLength={500} onChange={(e) => set("description", e.target.value)} /></Field>

      <section className="space-y-2 rounded-xl border border-border p-3" aria-label="Preview">
        <p className="text-sm font-medium">Preview <span className="font-normal text-muted-foreground">({plan.length} {plan.length === 1 ? "day" : "days"} from today)</span></p>
        {plan.length === 0 ? <p className="text-xs text-muted-foreground">{problem ?? "No days fall in this range from today."}</p> : null}
        <ul className="space-y-1 text-xs">
          {plan.slice(0, 8).map((d) => (
            <li key={d.date} className="flex flex-wrap gap-x-3"><span className="w-28 tabular-nums text-muted-foreground">{whenLabel({ startsOn: d.date, endsOn: d.date, startsAt: null, endsAt: null })}</span><span className="break-words">{d.people.map(nameOf).join(", ")}</span></li>
          ))}
        </ul>
        {plan.length > 8 ? <p className="text-xs text-muted-foreground">and {plan.length - 8} more</p> : null}
      </section>

      <FormMessage error={problem && (f.title || f.people.length) ? problem : err} />
      <DialogFooter className="gap-2 sm:justify-between">
        {rota ? (
          confirmDelete ? (
            <span className="flex items-center gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting" : "Yes, delete the rota"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </span>
          ) : <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
        ) : <span />}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !!problem}>{save.isPending ? "Saving" : rota ? "Save and lay out again" : "Save and lay out"}</Button>
        </span>
      </DialogFooter>
    </form>
  );
}
