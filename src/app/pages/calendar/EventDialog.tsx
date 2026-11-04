import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createEvent, deleteEvent, updateEvent, type EventInput } from "../../../lib/data/calendar";
import { AUDIENCE_LABELS, KIND_LABELS, formatRange, type CalEvent, type EventAudience, type EventKind } from "../../../lib/calendar";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const KINDS = Object.keys(KIND_LABELS) as EventKind[];
const AUDIENCES = Object.keys(AUDIENCE_LABELS) as EventAudience[];

const blank = (day: string): EventInput => ({
  title: "", description: "", kind: "event", startsOn: day, endsOn: day, startsAt: "", endsAt: "", audience: "all", published: false,
});

const fromEvent = (e: CalEvent): EventInput => ({
  title: e.title, description: e.description ?? "", kind: e.kind, startsOn: e.startsOn, endsOn: e.endsOn,
  startsAt: e.startsAt?.slice(0, 5) ?? "", endsAt: e.endsAt?.slice(0, 5) ?? "", audience: e.audience, published: e.published,
});

/**
 * One event. A person who may manage the calendar adds, edits or deletes; everyone else just reads it.
 * `event` is the one being opened, or null for a new one on `day`.
 */
export function EventDialog({
  open, onClose, event, day, canManage,
}: { open: boolean; onClose: () => void; event: CalEvent | null; day: string; canManage: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {open ? (canManage ? <Editor key={event?.id ?? `new-${day}`} event={event} day={day} onClose={onClose} /> : event ? <Reader event={event} /> : null) : null}
      </DialogContent>
    </Dialog>
  );
}

function Reader({ event }: { event: CalEvent }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{event.title}</DialogTitle>
        <DialogDescription>{formatRange(event)}</DialogDescription>
      </DialogHeader>
      <dl className="space-y-2 text-sm">
        <div className="flex gap-2"><dt className="text-muted-foreground">Kind</dt><dd>{KIND_LABELS[event.kind]}</dd></div>
        {event.description ? <p className="whitespace-pre-wrap break-words">{event.description}</p> : null}
      </dl>
    </>
  );
}

function Editor({ event, day, onClose }: { event: CalEvent | null; day: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<EventInput>(event ? fromEvent(event) : blank(day));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof EventInput>(k: K, v: EventInput[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const done = () => { void qc.invalidateQueries({ queryKey: ["calendar"] }); onClose(); };
  const save = useMutation({ mutationFn: () => (event ? updateEvent(event.id, f) : createEvent(f)), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteEvent(event!.id), onSuccess: done });

  const problem =
    !f.title.trim() ? "Give the event a title."
    : f.endsOn < f.startsOn ? "The event cannot end before it starts."
    : f.endsAt && !f.startsAt ? "Add a start time, or clear the end time."
    : f.startsOn === f.endsOn && f.startsAt && f.endsAt && f.endsAt <= f.startsAt ? "The end time must be after the start time."
    : null;

  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  const err = save.isError ? friendlyError(save.error) : remove.isError ? friendlyError(remove.error) : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{event ? "Change event" : "Add an event"}</DialogTitle>
        <DialogDescription>{event && !event.published ? "This is a draft. Only people who manage the calendar can see it." : "Events show to the people you choose once they are published."}</DialogDescription>
      </DialogHeader>

      <Field label="Title" htmlFor="ev-title">
        <Input id="ev-title" value={f.title} maxLength={120} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Open day" required autoFocus />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="ev-start">
          <Input id="ev-start" type="date" value={f.startsOn} onChange={(e) => setF((c) => ({ ...c, startsOn: e.target.value, endsOn: c.endsOn < e.target.value ? e.target.value : c.endsOn }))} required />
        </Field>
        <Field label="Ends" htmlFor="ev-end">
          <Input id="ev-end" type="date" value={f.endsOn} min={f.startsOn} onChange={(e) => set("endsOn", e.target.value)} required />
        </Field>
        <Field label="From (optional)" htmlFor="ev-from">
          <Input id="ev-from" type="time" value={f.startsAt} onChange={(e) => setF((c) => ({ ...c, startsAt: e.target.value, endsAt: e.target.value ? c.endsAt : "" }))} />
        </Field>
        <Field label="Until (optional)" htmlFor="ev-until">
          <Input id="ev-until" type="time" value={f.endsAt} disabled={!f.startsAt} onChange={(e) => set("endsAt", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Kind" htmlFor="ev-kind">
          <NativeSelect id="ev-kind" value={f.kind} onChange={(e) => set("kind", e.target.value as EventKind)}>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Who is it for?" htmlFor="ev-aud">
          <NativeSelect id="ev-aud" value={f.audience} onChange={(e) => set("audience", e.target.value as EventAudience)}>
            {AUDIENCES.map((a) => <option key={a} value={a}>{AUDIENCE_LABELS[a]}</option>)}
          </NativeSelect>
        </Field>
      </div>
      <Field label="Notes (optional)" htmlFor="ev-desc">
        <Textarea id="ev-desc" rows={3} value={f.description} maxLength={500} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={f.published} onChange={(e) => set("published", e.target.checked)} />
        <span>Published <span className="text-muted-foreground">(visible to the people it is for)</span></span>
      </label>

      <FormMessage error={problem && (f.title || f.endsOn < f.startsOn) ? problem : err} />
      <DialogFooter className="gap-2 sm:justify-between">
        {event ? (
          confirmDelete ? (
            <span className="flex items-center gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate()}>{remove.isPending ? "Deleting" : "Yes, delete"}</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </span>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>Delete</Button>
          )
        ) : <span />}
        <span className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={save.isPending || !!problem}>{save.isPending ? "Saving" : "Save"}</Button>
        </span>
      </DialogFooter>
    </form>
  );
}
