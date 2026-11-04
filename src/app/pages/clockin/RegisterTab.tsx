import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { getClockConfig, getRoster, listClockStaff, listDayEntries, markStaff, removeMarked, type RosterRow, type RosterStatus } from "../../../lib/data/clockin";
import { dayText, flagLabel, timeText } from "../../../lib/clockin";
import { addDays } from "../../../lib/tasks";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { Flags, StatusChip } from "./shared";

/** Mark someone in or out by hand for a day, and see (and undo) what was marked. */
function MarkDialog({ open, onClose, person, day, today }: { open: boolean; onClose: () => void; person: { id: string; name: string } | null; day: string; today: string }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {open && person ? <MarkForm key={`${person.id}-${day}`} person={person} day={day} today={today} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MarkForm({ person, day: initialDay, today, onClose }: { person: { id: string; name: string }; day: string; today: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(initialDay);
  const [kind, setKind] = useState<"in" | "out">("in");
  const [time, setTime] = useState("07:30");
  const [note, setNote] = useState("");
  const entries = useQuery({ queryKey: ["clockin-day", person.id, day], queryFn: () => listDayEntries(person.id, day) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["clockin-day", person.id] }); void qc.invalidateQueries({ queryKey: ["clockin-roster"] }); };
  const mark = useMutation({ mutationFn: () => markStaff(person.id, day, kind, time, note), onSuccess: () => { setNote(""); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => removeMarked(id), onSuccess: refresh });
  const submit = (e: FormEvent) => { e.preventDefault(); mark.mutate(); };
  const err = mark.isError ? friendlyError(mark.error) : remove.isError ? friendlyError(remove.error) : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="break-words">{person.name}</DialogTitle>
        <DialogDescription>Mark them in or out by hand. It shows in the record as marked by you.</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" htmlFor="mk-day"><Input id="mk-day" type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} required /></Field>
        <Field label="Time" htmlFor="mk-time"><Input id="mk-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></Field>
      </div>
      <div role="radiogroup" aria-label="Direction" className="flex gap-2">
        {([["in", "In"], ["out", "Out"]] as const).map(([v, label]) => (
          <button key={v} type="button" role="radio" aria-checked={kind === v} onClick={() => setKind(v)}
            className={`min-h-10 flex-1 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${kind === v ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}>{label}</button>
        ))}
      </div>
      <Field label="Note (optional)" htmlFor="mk-note"><Textarea id="mk-note" rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Came in late with a note from the clinic" /></Field>

      <section aria-label={`Entries for ${dayText(day)}`} className="space-y-1">
        <h3 className="text-sm font-semibold">{dayText(day)}</h3>
        {entries.isLoading ? <Skeleton className="h-10 w-full" /> : null}
        {entries.data && entries.data.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : null}
        <ul className="space-y-1">
          {(entries.data ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-14 tabular-nums">{timeText(e.capturedAt)}</span>
              <span className="w-12">{e.kind === "in" ? "In" : "Out"}</span>
              <span className="text-xs text-muted-foreground">{e.source === "marked" ? `marked by ${e.markedBy ?? "the office"}` : "scanned"}</span>
              {e.flags.map((f) => <span key={f} className="rounded-full border border-amber-500/40 px-2 text-[11px]">{flagLabel(f)}</span>)}
              {e.source === "marked" ? <Button type="button" size="sm" variant="ghost" className="ml-auto text-destructive" disabled={remove.isPending} onClick={() => remove.mutate(e.id)}>Remove</Button> : null}
              {e.note ? <span className="basis-full break-words text-xs text-muted-foreground">{e.note}</span> : null}
            </li>
          ))}
        </ul>
      </section>
      <FormMessage error={err} />
      <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Done</Button><Button type="submit" disabled={mark.isPending}>{mark.isPending ? "Saving" : "Add entry"}</Button></DialogFooter>
    </form>
  );
}

/** Who is in, late or absent, for a day or a run of days. For those who oversee staff and the person who takes attendance. */
export function RegisterTab() {
  const { can } = useCapabilities();
  const config = useQuery({ queryKey: ["clockin-config"], queryFn: getClockConfig, staleTime: 60_000 });
  const today = config.data?.today ?? new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const f = from || today, t = to || today;
  const [status, setStatus] = useState<"all" | RosterStatus>("all");
  const [q, setQ] = useState("");
  const [mark, setMark] = useState<{ id: string; name: string; day: string } | null>(null);
  const canMark = can("clockin.manage") || (config.data?.isTaker === true && config.data.mode !== "self");
  const staff = useQuery({ queryKey: ["clockin-staff"], queryFn: listClockStaff, enabled: canMark, staleTime: 5 * 60_000, retry: false });
  const roster = useQuery({ queryKey: ["clockin-roster", f, t], queryFn: () => getRoster(f, t), enabled: !!config.data && t >= f, retry: false });

  const rows = useMemo(() => (roster.data ?? []).filter((r) => (status === "all" || r.status === status) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()))), [roster.data, status, q]);
  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 };
    for (const r of roster.data ?? []) c[r.status]++;
    return c;
  }, [roster.data]);
  const byDay = useMemo(() => {
    const m = new Map<string, RosterRow[]>();
    for (const r of rows) m.set(r.day, [...(m.get(r.day) ?? []), r]);
    return [...m.entries()];
  }, [rows]);
  const preset = (days: number) => { setFrom(addDays(today, -days)); setTo(today); };

  return (
    <div className="space-y-4">
      <div className="surface grid gap-3 p-4 sm:grid-cols-[10rem_10rem_1fr]">
        <Field label="From" htmlFor="rg-from"><Input id="rg-from" type="date" value={f} max={t} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To" htmlFor="rg-to"><Input id="rg-to" type="date" value={t} min={f} max={today} onChange={(e) => setTo(e.target.value)} /></Field>
        <div className="flex flex-wrap items-end gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => { setFrom(today); setTo(today); }}>Today</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => preset(6)}>Last 7 days</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => preset(13)}>Last 14 days</Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">Weekends are left out, and so are holidays on the school calendar, unless someone clocked in that day.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm tabular-nums text-muted-foreground">{counts.present} present · {counts.late} late · {counts.absent} absent</p>
        {can("clockin.download") ? (
          <DownloadMenu action="clockin.download" label="Download" disabled={rows.length === 0} getTable={() => ({
            title: "Staff clock-in", subtitle: f === t ? dayText(f) : `${dayText(f)} to ${dayText(t)}`, filename: "staff-clock-in",
            columns: ["Date", "Name", "Status", "In", "Out", "Flags"],
            rows: rows.map((r) => [dayText(r.day), r.name, r.status, timeText(r.firstIn), timeText(r.lastOut), r.flags.map(flagLabel).join(", ")]),
          })} />
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <Input aria-label="Search staff" placeholder="Search staff" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">Everyone</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option>
        </NativeSelect>
      </div>

      {roster.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {roster.isError ? <p role="alert" className="surface p-4 text-sm">{friendlyError(roster.error)}</p> : null}
      {roster.data && byDay.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">{(roster.data.length === 0) ? "No school days in this range yet. Weekends, and holidays on the school calendar, are left out." : "Nobody matches."}</p> : null}
      {byDay.map(([day, list]) => (
        <section key={day} aria-label={dayText(day)} className="space-y-2">
          <h3 className="text-sm font-semibold">{dayText(day)}</h3>
          <ul className="grid gap-2">
            {list.map((r) => (
              <li key={r.profileId} className="surface flex items-start justify-between gap-3 p-3">
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-sm font-medium">{r.name}</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{r.firstIn || r.lastOut ? `In ${timeText(r.firstIn) || "—"} · Out ${timeText(r.lastOut) || "—"}` : "No clock-in"}{r.marked ? " · marked by hand" : ""}</p>
                  <Flags flags={r.flags.filter((f) => f !== "late")} />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <StatusChip status={r.status} />
                  {canMark ? <Button type="button" size="icon" variant="ghost" aria-label={`Mark ${r.name} for ${dayText(r.day)}`} onClick={() => setMark({ id: r.profileId, name: r.name, day: r.day })}><Pencil className="size-4" aria-hidden /></Button> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {canMark && staff.data ? (
        <div className="surface flex flex-wrap items-end gap-2 p-3">
          <div className="min-w-48 flex-1"><label htmlFor="rg-who" className="mb-1 block text-xs text-muted-foreground">Mark someone not shown above</label>
            <NativeSelect id="rg-who" value="" onChange={(e) => { const p = staff.data.find((s) => s.id === e.target.value); if (p) setMark({ id: p.id, name: p.name, day: t }); }}>
              <option value="">Choose a member of staff</option>{staff.data.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          </div>
        </div>
      ) : null}
      <MarkDialog open={mark !== null} onClose={() => setMark(null)} person={mark ? { id: mark.id, name: mark.name } : null} day={mark?.day ?? today} today={today} />
    </div>
  );
}
