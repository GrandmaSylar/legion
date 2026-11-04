import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteTask, saveTask, type Staffer, type Task } from "../../../lib/data/tasks";
import { listExamPeriods } from "../../../lib/data/examPeriods";
import { KIND_LABELS, type TaskKind } from "../../../lib/tasks";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { todayKey } from "./TaskRow";

const KINDS = Object.keys(KIND_LABELS) as TaskKind[];

/** Choose staff from a searchable list. Selected people are ticked; the count is always shown. */
export function PeoplePicker({ staff, value, onChange, label = "People" }: { staff: Staffer[]; value: string[]; onChange: (ids: string[]) => void; label?: string }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => staff.filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())), [staff, q]);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label} <span className="font-normal text-muted-foreground">({value.length} chosen)</span></legend>
      <Input aria-label="Search staff" placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-xl border border-border">
        {shown.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No staff match.</li> : null}
        {shown.map((s) => (
          <li key={s.id}>
            <label className={cn("flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-foreground/5", value.includes(s.id) && "bg-primary/5")}>
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={value.includes(s.id)} onChange={() => toggle(s.id)} />
              <span className="min-w-0 break-words">{s.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Create or change one task, or remove it. Only people who assign tasks reach this. */
export function TaskDialog({ open, onClose, task, staff }: { open: boolean; onClose: () => void; task: Task | null; staff: Staffer[] }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open ? <Form key={task?.id ?? "new"} task={task} staff={staff} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Form({ task, staff, onClose }: { task: Task | null; staff: Staffer[]; onClose: () => void }) {
  const qc = useQueryClient();
  const today = todayKey();
  const [f, setF] = useState(() => ({
    title: task?.title ?? "", description: task?.description ?? "", kind: (task?.kind ?? "duty") as TaskKind,
    startsOn: task?.startsOn ?? today, endsOn: task?.endsOn ?? today, startsAt: task?.startsAt?.slice(0, 5) ?? "", endsAt: task?.endsAt?.slice(0, 5) ?? "",
    location: task?.location ?? "", examPeriodId: task?.examPeriodId ?? "", people: task?.people.map((p) => p.profileId) ?? [],
  }));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((c) => ({ ...c, [k]: v }));
  const periods = useQuery({ queryKey: ["exam-periods"], queryFn: listExamPeriods, staleTime: 60_000, retry: false, enabled: f.kind === "invigilation" });

  const done = () => { void qc.invalidateQueries({ queryKey: ["tasks"] }); onClose(); };
  const save = useMutation({ mutationFn: () => saveTask({ ...f, id: task?.id }), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteTask(task!.id), onSuccess: done });

  const problem =
    !f.title.trim() ? "Give the task a title."
    : f.people.length === 0 ? "Choose at least one person."
    : f.endsOn < f.startsOn ? "The task cannot end before it starts."
    : f.endsAt && !f.startsAt ? "Add a start time, or clear the end time."
    : f.startsOn === f.endsOn && f.startsAt && f.endsAt && f.endsAt <= f.startsAt ? "The end time must be after the start time."
    : null;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  const err = save.isError ? friendlyError(save.error) : remove.isError ? friendlyError(remove.error) : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{task ? "Change task" : "New task"}</DialogTitle>
        <DialogDescription>People are told when a task is given to them, and each ticks off their own part.</DialogDescription>
      </DialogHeader>

      <Field label="Title" htmlFor="tk-title">
        <Input id="tk-title" value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Morning gate duty" required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="tk-kind">
          <NativeSelect id="tk-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as TaskKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Where (optional)" htmlFor="tk-where">
          <Input id="tk-where" value={f.location} maxLength={80} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Main gate" />
        </Field>
        <Field label="Starts" htmlFor="tk-start">
          <Input id="tk-start" type="date" value={f.startsOn} onChange={(e) => setF((c) => ({ ...c, startsOn: e.target.value, endsOn: c.endsOn < e.target.value ? e.target.value : c.endsOn }))} required />
        </Field>
        <Field label="Ends" htmlFor="tk-end">
          <Input id="tk-end" type="date" value={f.endsOn} min={f.startsOn} onChange={(e) => set("endsOn", e.target.value)} required />
        </Field>
        <Field label="From (optional)" htmlFor="tk-from">
          <Input id="tk-from" type="time" value={f.startsAt} onChange={(e) => setF((c) => ({ ...c, startsAt: e.target.value, endsAt: e.target.value ? c.endsAt : "" }))} />
        </Field>
        <Field label="Until (optional)" htmlFor="tk-until">
          <Input id="tk-until" type="time" value={f.endsAt} disabled={!f.startsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </Field>
      </div>
      {f.kind === "invigilation" && (periods.data ?? []).length > 0 ? (
        <Field label="Exam period (optional)" htmlFor="tk-exam">
          <NativeSelect id="tk-exam" value={f.examPeriodId} onChange={(e) => set("examPeriodId", e.target.value)}>
            <option value="">Not linked to an exam period</option>
            {(periods.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      <Field label="Notes (optional)" htmlFor="tk-notes">
        <Textarea id="tk-notes" rows={2} value={f.description} maxLength={500} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <PeoplePicker staff={staff} value={f.people} onChange={(ids) => set("people", ids)} />

      <FormMessage error={problem && (f.title || f.people.length) ? problem : err} />
      <DialogFooter className="gap-2 sm:justify-between">
        {task ? (
          confirmDelete ? (
            <span className="flex items-center gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting" : "Yes, delete"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </span>
          ) : <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
        ) : <span />}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !!problem}>{save.isPending ? "Saving" : "Save"}</Button>
        </span>
      </DialogFooter>
    </form>
  );
}
