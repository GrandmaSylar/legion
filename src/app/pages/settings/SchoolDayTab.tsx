import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  applyBellScheduleToAll, deleteBellSchedule, listBellAssignments, listBellSchedules, saveBellSchedule, setBellAssignment,
  type BellSchedule,
} from "../../../lib/data/schedules";
import { listLevels } from "../../../lib/data/setup";
import { WEEKDAYS } from "../../../lib/data/timetable";
import { buildDay, dayProblem, describeDay, fromMinutes, toMinutes, type BreakInput, type DayPeriod } from "../../../lib/bell";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";

/** The day drawn to scale: lessons in colour, breaks in grey, so two schedules can be compared at a glance. */
function DayBar({ periods }: { periods: DayPeriod[] }) {
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  if (sorted.length === 0) return null;
  const from = toMinutes(sorted[0].start);
  const span = Math.max(1, toMinutes(sorted[sorted.length - 1].end) - from);
  return (
    <div className="relative h-5 overflow-hidden rounded-md bg-foreground/[0.06]" role="img" aria-label={describeDay(periods)}>
      {sorted.map((p, i) => (
        <div
          key={i} title={`${p.label} ${p.start}–${p.end}`}
          className={cn("absolute inset-y-0 border-r border-background", p.kind === "lesson" ? "bg-primary/60" : "bg-foreground/20")}
          style={{ left: `${((toMinutes(p.start) - from) / span) * 100}%`, width: `${((toMinutes(p.end) - toMinutes(p.start)) / span) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** The school day: the periods and breaks, which schedule each weekday uses, and applying it to the classes. */
export default function SchoolDayTab() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const canManage = can("timetable.manage_schedule");
  const schedules = useQuery({ queryKey: ["bell-schedules"], queryFn: listBellSchedules });
  const assignments = useQuery({ queryKey: ["bell-assignments"], queryFn: listBellAssignments });
  const levels = useQuery({ queryKey: ["levels"], queryFn: listLevels, staleTime: 10 * 60_000 });
  const [editing, setEditing] = useState<{ schedule: BellSchedule | null; copyOf?: BellSchedule } | null>(null);
  const [levelId, setLevelId] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["bell-schedules"] });
    void qc.invalidateQueries({ queryKey: ["bell-assignments"] });
    void qc.invalidateQueries({ queryKey: ["timetable"] });
  };
  const assign = useMutation({
    mutationFn: (v: { levelId: string | null; day: number; scheduleId: string | null }) => setBellAssignment(v.levelId, v.day, v.scheduleId),
    onSuccess: () => { setMessage(null); refresh(); },
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteBellSchedule(id), onSuccess: refresh });
  const applyAll = useMutation({
    mutationFn: applyBellScheduleToAll,
    onSuccess: (r) => {
      refresh();
      setMessage(`Applied to ${r.classes ?? 0} ${r.classes === 1 ? "class" : "classes"}: ${r.created} added, ${r.removed} empty ${r.removed === 1 ? "slot" : "slots"} removed${r.offSchedule ? `, ${r.offSchedule} ${r.offSchedule === 1 ? "lesson" : "lessons"} with a subject no longer match the school day and were kept` : ""}.`);
    },
    onError: () => setMessage(null),
  });

  const list = schedules.data ?? [];
  const all = assignments.data ?? [];
  const pick = (lv: string | null, day: number) => all.find((a) => a.levelId === lv && a.day === day)?.scheduleId ?? "";
  const usedBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of all) m.set(a.scheduleId, (m.get(a.scheduleId) ?? 0) + 1);
    return m;
  }, [all]);
  const overrides = new Set(all.filter((a) => a.levelId).map((a) => a.levelId));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-medium">The school day</h2>
          <p className="text-sm text-muted-foreground">
            Say how your day runs: how many lessons, how long each lasts, and when the breaks are. Then choose which days use it. Timetables for the classes follow it.
          </p>
        </div>
        {canManage ? <Button type="button" size="sm" onClick={() => setEditing({ schedule: null })}><Plus className="size-4" aria-hidden /> New school day</Button> : null}
      </div>

      {schedules.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {schedules.isError ? <p role="alert" className="surface p-4 text-sm">The school day could not be loaded.</p> : null}
      {schedules.data && list.length === 0 ? <p className="surface p-6 text-sm text-muted-foreground">No school day has been set up yet.{canManage ? " Press New school day to build one in a minute." : ""}</p> : null}
      <FormMessage error={remove.isError ? friendlyError(remove.error) : null} />

      <ul className="grid gap-3">
        {list.map((s) => (
          <li key={s.id} className="surface space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold">{s.name}</h3>
                <p className="text-xs text-muted-foreground">{describeDay(s.periods)} · used on {usedBy.get(s.id) ?? 0} {usedBy.get(s.id) === 1 ? "day" : "days"}</p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditing({ schedule: s })}>Edit</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditing({ schedule: null, copyOf: s })}>Copy</Button>
                  <Button
                    type="button" size="sm" variant="ghost" className="text-destructive" aria-label={`Delete ${s.name}`}
                    disabled={remove.isPending || (usedBy.get(s.id) ?? 0) > 0} title={(usedBy.get(s.id) ?? 0) > 0 ? "Choose another school day for the days using it first" : undefined}
                    onClick={() => remove.mutate(s.id)}
                  ><Trash2 className="size-4" aria-hidden /></Button>
                </div>
              ) : null}
            </div>
            <DayBar periods={s.periods} />
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-muted-foreground">
              {s.periods.map((p, i) => <li key={i} className={p.kind === "break" ? "italic" : ""}>{p.start}–{p.end} {p.label}</li>)}
            </ul>
          </li>
        ))}
      </ul>

      {list.length > 0 ? (
        <section className="surface space-y-4 p-4" aria-label="Which day uses which">
          <div>
            <h3 className="text-base font-medium">Which school day each weekday uses</h3>
            <p className="text-xs text-muted-foreground">A shorter Friday, say. A level can run different days from the rest of the school; it wins over the school-wide choice.</p>
          </div>
          <FormMessage error={assign.isError ? friendlyError(assign.error) : null} />
          <ul className="grid gap-3 sm:grid-cols-5">
            {WEEKDAYS.map((d) => (
              <li key={d.day}>
                <Field label={d.name} htmlFor={`bd-${d.day}`}>
                  <NativeSelect id={`bd-${d.day}`} value={pick(null, d.day)} disabled={!canManage || assign.isPending}
                    onChange={(e) => assign.mutate({ levelId: null, day: d.day, scheduleId: e.target.value || null })}>
                    <option value="">None</option>
                    {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </NativeSelect>
                </Field>
              </li>
            ))}
          </ul>

          <details className="rounded-xl border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              Different days for a level <span className="text-xs font-normal text-muted-foreground">({overrides.size} {overrides.size === 1 ? "level differs" : "levels differ"})</span>
            </summary>
            <div className="mt-3 space-y-3">
              <Field label="Level" htmlFor="bd-level">
                <NativeSelect id="bd-level" value={levelId} onChange={(e) => setLevelId(e.target.value)}>
                  <option value="">Choose a level</option>
                  {(levels.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}{overrides.has(l.id) ? " (differs)" : ""}</option>)}
                </NativeSelect>
              </Field>
              {levelId ? (
                <ul className="grid gap-3 sm:grid-cols-5">
                  {WEEKDAYS.map((d) => (
                    <li key={d.day}>
                      <Field label={d.short} htmlFor={`bl-${d.day}`}>
                        <NativeSelect id={`bl-${d.day}`} value={pick(levelId, d.day)} disabled={!canManage || assign.isPending}
                          onChange={(e) => assign.mutate({ levelId, day: d.day, scheduleId: e.target.value || null })}>
                          <option value="">Same as the school</option>
                          {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </NativeSelect>
                      </Field>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>

          {canManage ? (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Choosing days does not change any timetable by itself. Apply the school day to lay out every class&apos;s slots. A subject already placed in a lesson stays where it is; empty slots that no longer fit are removed.
              </p>
              <Button type="button" size="sm" disabled={applyAll.isPending} onClick={() => applyAll.mutate()}>
                {applyAll.isPending ? "Applying" : "Apply to every class"}
              </Button>
              <FormMessage error={applyAll.isError ? friendlyError(applyAll.error) : null} ok={message} />
            </div>
          ) : null}
        </section>
      ) : null}

      <ScheduleDialog
        key={editing === null ? "none" : editing.schedule?.id ?? editing.copyOf?.id ?? "new"}
        open={editing !== null} onClose={() => setEditing(null)} schedule={editing?.schedule ?? null} copyOf={editing?.copyOf ?? null} onSaved={refresh}
      />
    </div>
  );
}

function ScheduleDialog({ open, onClose, schedule, copyOf, onSaved }: { open: boolean; onClose: () => void; schedule: BellSchedule | null; copyOf: BellSchedule | null; onSaved: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        {open ? <ScheduleForm schedule={schedule} copyOf={copyOf} onClose={onClose} onSaved={onSaved} /> : null}
      </DialogContent>
    </Dialog>
  );
}

interface Row extends DayPeriod { key: string }
let rowKey = 0;
const withKey = (p: DayPeriod): Row => ({ ...p, key: `p${++rowKey}` });

function ScheduleForm({ schedule, copyOf, onClose, onSaved }: { schedule: BellSchedule | null; copyOf: BellSchedule | null; onClose: () => void; onSaved: () => void }) {
  const source = schedule ?? copyOf;
  const [name, setName] = useState(schedule ? schedule.name : copyOf ? `${copyOf.name} (copy)` : "");
  const [rows, setRows] = useState<Row[]>(() => (source ? source.periods : buildDay({ start: "08:00", lessonMinutes: 40, lessons: 8, breaks: [{ afterLesson: 2, minutes: 20, label: "Snack break" }, { afterLesson: 5, minutes: 40, label: "Lunch" }] }).periods).map(withKey));

  // The quick builder
  const [start, setStart] = useState("08:00");
  const [minutes, setMinutes] = useState("40");
  const [lessons, setLessons] = useState("8");
  const [breaks, setBreaks] = useState<{ key: string; afterLesson: string; minutes: string; label: string }[]>([
    { key: "b1", afterLesson: "2", minutes: "20", label: "Snack break" }, { key: "b2", afterLesson: "5", minutes: "40", label: "Lunch" },
  ]);
  const built = buildDay({
    start, lessonMinutes: Number(minutes), lessons: Number(lessons),
    breaks: breaks.map<BreakInput>((b) => ({ afterLesson: Number(b.afterLesson), minutes: Number(b.minutes), label: b.label })),
  });

  const save = useMutation({
    mutationFn: () => saveBellSchedule({ id: schedule?.id, name, periods: rows.map(({ key: _k, ...p }) => p) }),
    onSuccess: () => { onSaved(); onClose(); },
  });
  const problem = !name.trim() ? "Give the school day a name." : dayProblem(rows);
  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  const setRow = (key: string, patch: Partial<DayPeriod>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const sorted = [...rows].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{schedule ? "Change school day" : "New school day"}</DialogTitle>
        <DialogDescription>Describe the day in lessons and breaks, then adjust any time by hand.</DialogDescription>
      </DialogHeader>

      <Field label="Name" htmlFor="sd-name">
        <Input id="sd-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard day, or Friday" required />
      </Field>

      <details className="rounded-xl border border-border p-3" open={!source}>
        <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]">Quick builder: lessons and breaks</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Day starts" htmlFor="qb-start"><Input id="qb-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label="Lesson length (minutes)" htmlFor="qb-min"><Input id="qb-min" type="number" min="5" max="180" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
            <Field label="Number of lessons" htmlFor="qb-n"><Input id="qb-n" type="number" min="1" max="15" inputMode="numeric" value={lessons} onChange={(e) => setLessons(e.target.value)} /></Field>
          </div>
          <ul className="space-y-2" aria-label="Breaks">
            {breaks.map((b) => (
              <li key={b.key} className="grid grid-cols-[4.5rem_4.5rem_1fr_auto] items-end gap-2">
                <Field label="After lesson" htmlFor={`qa-${b.key}`}><Input id={`qa-${b.key}`} type="number" min="1" max="15" inputMode="numeric" value={b.afterLesson} onChange={(e) => setBreaks((cur) => cur.map((x) => (x.key === b.key ? { ...x, afterLesson: e.target.value } : x)))} /></Field>
                <Field label="Minutes" htmlFor={`qm-${b.key}`}><Input id={`qm-${b.key}`} type="number" min="1" max="180" inputMode="numeric" value={b.minutes} onChange={(e) => setBreaks((cur) => cur.map((x) => (x.key === b.key ? { ...x, minutes: e.target.value } : x)))} /></Field>
                <Field label="Name" htmlFor={`ql-${b.key}`}><Input id={`ql-${b.key}`} value={b.label} maxLength={40} onChange={(e) => setBreaks((cur) => cur.map((x) => (x.key === b.key ? { ...x, label: e.target.value } : x)))} /></Field>
                <Button type="button" size="icon" variant="ghost" aria-label="Remove this break" onClick={() => setBreaks((cur) => cur.filter((x) => x.key !== b.key))}><Trash2 className="size-4" aria-hidden /></Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setBreaks((cur) => [...cur, { key: `b${Date.now()}`, afterLesson: "3", minutes: "15", label: "Break" }])}><Plus className="size-4" aria-hidden /> Add a break</Button>
            <Button type="button" size="sm" disabled={!!built.error} onClick={() => setRows(built.periods.map(withKey))}>
              {rows.length > 0 && source ? "Replace the periods below" : "Lay out the day"}
            </Button>
          </div>
          {built.error ? <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{built.error}</p> : <p className="text-xs text-muted-foreground">This gives {describeDay(built.periods)}.</p>}
        </div>
      </details>

      <DayBar periods={rows} />
      <ul className="space-y-2" aria-label="Periods">
        {sorted.map((r) => (
          <li key={r.key} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_8rem_7rem_7rem_auto]">
            <div className="col-span-3 sm:col-span-1"><Field label="Name" htmlFor={`pl-${r.key}`}><Input id={`pl-${r.key}`} value={r.label} maxLength={40} onChange={(e) => setRow(r.key, { label: e.target.value })} /></Field></div>
            <div className="col-span-3 sm:col-span-1"><Field label="Kind" htmlFor={`pk-${r.key}`}>
              <NativeSelect id={`pk-${r.key}`} value={r.kind} onChange={(e) => setRow(r.key, { kind: e.target.value as DayPeriod["kind"] })}>
                <option value="lesson">Lesson</option><option value="break">Break</option>
              </NativeSelect></Field></div>
            <Field label="Starts" htmlFor={`ps-${r.key}`}><Input id={`ps-${r.key}`} type="time" value={r.start} onChange={(e) => setRow(r.key, { start: e.target.value })} /></Field>
            <Field label="Ends" htmlFor={`pe-${r.key}`}><Input id={`pe-${r.key}`} type="time" value={r.end} onChange={(e) => setRow(r.key, { end: e.target.value })} /></Field>
            <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${r.label || "this period"}`} onClick={() => setRows((cur) => cur.filter((x) => x.key !== r.key))}><Trash2 className="size-4" aria-hidden /></Button>
          </li>
        ))}
      </ul>
      <Button type="button" size="sm" variant="outline" onClick={() => {
        const last = sorted[sorted.length - 1];
        const from = last?.end ?? "08:00";
        setRows((cur) => [...cur, withKey({ label: "", kind: "lesson", start: from, end: fromMinutes(Math.min(23 * 60 + 59, toMinutes(from) + 40)) })]);
      }}><Plus className="size-4" aria-hidden /> Add a period</Button>

      <p className="text-xs text-muted-foreground tabular-nums" role="status">{describeDay(rows)}</p>
      <FormMessage error={problem && name ? problem : save.isError ? friendlyError(save.error) : null} />
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={save.isPending || !!problem}>{save.isPending ? "Saving" : "Save school day"}</Button>
      </DialogFooter>
    </form>
  );
}
