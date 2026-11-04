import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { listClasses, listTerms } from "../../../lib/data/setup";
import {
  EXAM_KIND_LABELS, createExamPeriod, deleteExamPeriod, listExamPeriods, presetFor, updateExamPeriod, windowState,
  type ExamKind, type ExamPeriod, type ExamPeriodInput,
} from "../../../lib/data/examPeriods";
import { addDays, formatRange } from "../../../lib/calendar";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { ExamTimetableDialog } from "./ExamTimetableDialog";

const KINDS = Object.keys(EXAM_KIND_LABELS) as ExamKind[];

const WINDOW_BADGE = {
  none: null,
  upcoming: { text: "Entry not open yet", cls: "bg-amber-500/15 text-amber-800 dark:text-amber-200" },
  open: { text: "Entry open", cls: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" },
  closed: { text: "Entry closed", cls: "bg-foreground/10 text-muted-foreground" },
} as const;

/** Exam periods for the school: dates, classes, and what each one switches on. */
export default function ExamPeriodsTab() {
  const { can } = useCapabilities();
  const canManage = can("grades.manage_exam_periods");
  const periods = useQuery({ queryKey: ["exam-periods"], queryFn: listExamPeriods });
  const terms = useQuery({ queryKey: ["terms"], queryFn: listTerms, staleTime: 5 * 60_000 });
  const [editing, setEditing] = useState<ExamPeriod | "new" | null>(null);
  const [timetable, setTimetable] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const termName = (id: string) => terms.data?.find((t) => t.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">Exam periods</h2>
          <p className="text-sm text-muted-foreground">
            A named stretch of the term for mocks, mid-term tests or the term exam. A period can show on the calendar and can limit when teachers may enter marks.
          </p>
        </div>
        {canManage ? <Button type="button" size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> New exam period</Button> : null}
      </div>

      {periods.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {periods.isError ? <p role="alert" className="surface p-4 text-sm">Exam periods could not be loaded.</p> : null}
      {periods.data && periods.data.length === 0 ? (
        <p className="surface p-6 text-sm text-muted-foreground">No exam periods yet.{canManage ? " Press New exam period to add the first one." : ""}</p>
      ) : null}

      <ul className="grid gap-3">
        {(periods.data ?? []).map((p) => {
          const w = windowState(p, today);
          const badge = WINDOW_BADGE[w];
          return (
            <li key={p.id} className="surface space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">{p.name}</h3>
                  <p className="text-xs text-muted-foreground">{EXAM_KIND_LABELS[p.kind]} · {termName(p.termId)} · {formatRange({ startsOn: p.startsOn, endsOn: p.endsOn, startsAt: null, endsAt: null })}</p>
                </div>
                {canManage ? (
                  <span className="flex gap-2">
                    {p.useTimetable ? <Button type="button" size="sm" variant="outline" onClick={() => setTimetable(p.id)}>Timetable</Button> : null}
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditing(p)}>Edit</Button>
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-foreground/10 px-2.5 py-1">{p.allClasses ? "All classes" : `${p.classIds.length} ${p.classIds.length === 1 ? "class" : "classes"}`}</span>
                {p.restrictEntry ? (
                  <span className={cn("rounded-full px-2.5 py-1", badge?.cls)}>
                    {badge?.text}: {p.entryOpensOn} to {p.entryClosesOn}
                  </span>
                ) : <span className="rounded-full bg-foreground/10 px-2.5 py-1">Marks can be entered any time</span>}
                {p.showOnCalendar ? <span className="rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-800 dark:text-sky-200">On the calendar</span> : null}
                {p.useTimetable ? <span className={cn("rounded-full px-2.5 py-1", p.timetablePublished ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-foreground/10")}>{p.timetablePublished ? "Timetable published" : "Timetable (draft)"}</span> : null}
              </div>
            </li>
          );
        })}
      </ul>

      {(periods.data ?? []).filter((p) => p.id === timetable).map((p) => <ExamTimetableDialog key={p.id} period={p} open onClose={() => setTimetable(null)} />)}
      <PeriodDialog
        key={editing === null ? "none" : editing === "new" ? "new" : editing.id}
        open={editing !== null} onClose={() => setEditing(null)}
        period={editing && editing !== "new" ? editing : null}
      />
    </div>
  );
}

function PeriodDialog({ open, onClose, period }: { open: boolean; onClose: () => void; period: ExamPeriod | null }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open ? <Form period={period} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Form({ period, onClose }: { period: ExamPeriod | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const terms = useQuery({ queryKey: ["terms"], queryFn: listTerms, staleTime: 5 * 60_000 });
  const currentTerm = terms.data?.find((t) => t.isCurrent) ?? terms.data?.[0];

  const [f, setF] = useState<ExamPeriodInput>(() => period ? {
    termId: period.termId, name: period.name, kind: period.kind, startsOn: period.startsOn, endsOn: period.endsOn, allClasses: period.allClasses,
    classIds: period.classIds, restrictEntry: period.restrictEntry, entryOpensOn: period.entryOpensOn ?? period.startsOn,
    entryClosesOn: period.entryClosesOn ?? addDays(period.endsOn, 3), showOnCalendar: period.showOnCalendar, useTimetable: period.useTimetable,
  } : { termId: "", name: "", kind: "term_exam", startsOn: "", endsOn: "", allClasses: true, classIds: [], restrictEntry: false, entryOpensOn: "", entryClosesOn: "", showOnCalendar: true, useTimetable: false });
  const [autoWindow, setAutoWindow] = useState(!period);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const termId = f.termId || currentTerm?.id || "";
  const term = terms.data?.find((t) => t.id === termId);

  const classes = useQuery({
    queryKey: ["classes", term?.academicYearId], queryFn: () => listClasses(term!.academicYearId), enabled: !!term && !f.allClasses,
  });
  const byLevel = useMemo(() => [...(classes.data ?? [])].sort((a, b) => a.levelOrder - b.levelOrder || a.section.localeCompare(b.section)), [classes.data]);

  const set = <K extends keyof ExamPeriodInput>(k: K, v: ExamPeriodInput[K]) => setF((c) => ({ ...c, [k]: v }));

  /** Choosing a kind fills in a sensible name and window; every value can still be changed. */
  const applyKind = (kind: ExamKind) => setF((c) => {
    const starts = c.startsOn || term?.startDate || "";
    const ends = c.endsOn || starts;
    const p = starts ? presetFor(kind, starts, ends, addDays) : null;
    // Replace the name only if it is empty or one of the suggested names, never one the person typed.
    const wasPresetName = !c.name || ["Mock exam", "Mid-term tests", "End of term exams"].includes(c.name);
    return {
      ...c, kind,
      name: p && wasPresetName ? p.name : c.name,
      restrictEntry: p ? p.restrictEntry : c.restrictEntry,
      entryOpensOn: p ? p.entryOpensOn : c.entryOpensOn,
      entryClosesOn: p ? p.entryClosesOn : c.entryClosesOn,
    };
  });
  const setDates = (starts: string, ends: string) => setF((c) => {
    const next = { ...c, startsOn: starts, endsOn: ends };
    if (autoWindow && starts && ends) {
      const p = presetFor(c.kind, starts, ends, addDays);
      next.entryOpensOn = p.entryOpensOn;
      next.entryClosesOn = p.entryClosesOn;
    }
    return next;
  });

  const done = () => { void qc.invalidateQueries({ queryKey: ["exam-periods"] }); void qc.invalidateQueries({ queryKey: ["calendar"] }); onClose(); };
  const input: ExamPeriodInput = { ...f, termId };
  const save = useMutation({ mutationFn: () => (period ? updateExamPeriod(period.id, input) : createExamPeriod(input)), onSuccess: done });
  const remove = useMutation({ mutationFn: () => deleteExamPeriod(period!.id), onSuccess: done });

  const problem =
    !f.name.trim() ? "Give the exam period a name."
    : !termId ? "Choose a term."
    : !f.startsOn || !f.endsOn ? "Choose the dates."
    : f.endsOn < f.startsOn ? "The period cannot end before it starts."
    : f.restrictEntry && (!f.entryOpensOn || !f.entryClosesOn) ? "Choose when mark entry opens and closes."
    : f.restrictEntry && f.entryClosesOn < f.entryOpensOn ? "Mark entry cannot close before it opens."
    : !f.allClasses && f.classIds.length === 0 ? "Choose at least one class, or switch on All classes."
    : null;

  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  const err = save.isError ? friendlyError(save.error) : remove.isError ? friendlyError(remove.error) : null;
  const toggleClass = (id: string) => set("classIds", f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id]);

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{period ? "Change exam period" : "New exam period"}</DialogTitle>
        <DialogDescription>Choose a kind to start from a sensible set-up. Everything can be changed.</DialogDescription>
      </DialogHeader>

      <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KINDS.map((k) => (
          <button
            key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => applyKind(k)}
            className={cn("min-h-11 rounded-xl border px-2 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]", f.kind === k ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5")}
          >{EXAM_KIND_LABELS[k]}</button>
        ))}
      </div>

      <Field label="Name" htmlFor="ep-name">
        <Input id="ep-name" value={f.name} maxLength={80} onChange={(e) => set("name", e.target.value)} placeholder="e.g. End of term exams" required />
      </Field>
      <Field label="Term" htmlFor="ep-term">
        <NativeSelect id="ep-term" value={termId} onChange={(e) => set("termId", e.target.value)}>
          {(terms.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="ep-start">
          <Input id="ep-start" type="date" value={f.startsOn} onChange={(e) => setDates(e.target.value, f.endsOn && f.endsOn >= e.target.value ? f.endsOn : e.target.value)} required />
        </Field>
        <Field label="Ends" htmlFor="ep-end">
          <Input id="ep-end" type="date" value={f.endsOn} min={f.startsOn || undefined} onChange={(e) => setDates(f.startsOn, e.target.value)} required />
        </Field>
      </div>

      <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Classes">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="ep-all" className="text-sm font-medium">All classes</label>
          <Switch id="ep-all" checked={f.allClasses} onCheckedChange={(v) => set("allClasses", v)} aria-label={`All classes: ${f.allClasses ? "on" : "off"}`} />
        </div>
        {!f.allClasses ? (
          <div className="flex flex-wrap gap-2">
            {classes.isLoading ? <Skeleton className="h-8 w-full" /> : null}
            {byLevel.map((c) => (
              <button
                key={c.id} type="button" role="checkbox" aria-checked={f.classIds.includes(c.id)} onClick={() => toggleClass(c.id)}
                className={cn("min-h-9 rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]", f.classIds.includes(c.id) ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5")}
              >{c.levelName} {c.section}</button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-border p-3" aria-label="Entering marks">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <label htmlFor="ep-restrict" className="block text-sm font-medium">Limit when marks can be entered</label>
            <p className="text-xs text-muted-foreground">Teachers can enter or change marks of assessments in this period only between these dates. The head and exams officer can always enter marks.</p>
          </div>
          <Switch id="ep-restrict" checked={f.restrictEntry} onCheckedChange={(v) => set("restrictEntry", v)} aria-label={`Limit when marks can be entered: ${f.restrictEntry ? "on" : "off"}`} />
        </div>
        {f.restrictEntry ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opens" htmlFor="ep-open">
              <Input id="ep-open" type="date" value={f.entryOpensOn} onChange={(e) => { setAutoWindow(false); set("entryOpensOn", e.target.value); }} />
            </Field>
            <Field label="Closes" htmlFor="ep-close">
              <Input id="ep-close" type="date" value={f.entryClosesOn} min={f.entryOpensOn || undefined} onChange={(e) => { setAutoWindow(false); set("entryClosesOn", e.target.value); }} />
            </Field>
          </div>
        ) : null}
      </section>

      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0">
          <label htmlFor="ep-cal" className="block text-sm font-medium">Show on the calendar</label>
          <p className="text-xs text-muted-foreground">Adds the period to the calendar as a draft. It becomes visible when you publish the calendar.{!can("calendar.manage") ? " You cannot publish the calendar yourself." : ""}</p>
        </div>
        <Switch id="ep-cal" checked={f.showOnCalendar} onCheckedChange={(v) => set("showOnCalendar", v)} aria-label={`Show on the calendar: ${f.showOnCalendar ? "on" : "off"}`} />
      </div>
      <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0">
          <label htmlFor="ep-tt" className="block text-sm font-medium">Exam timetable</label>
          <p className="text-xs text-muted-foreground">Lets you list the papers (class, subject, day, time and room), give them invigilators, and publish the timetable to parents and pupils. Switching it off returns a published timetable to a draft.</p>
        </div>
        <Switch id="ep-tt" checked={f.useTimetable} onCheckedChange={(v) => set("useTimetable", v)} aria-label={`Exam timetable: ${f.useTimetable ? "on" : "off"}`} />
      </div>
      <p className="text-xs text-muted-foreground">How this period counts toward a term result is set by the assessment scheme: tie a part to this kind of exam under Settings, How marks add up.</p>

      <FormMessage error={problem && (f.name || f.startsOn) ? problem : err} />
      <DialogFooter className="gap-2 sm:justify-between">
        {period ? (
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
