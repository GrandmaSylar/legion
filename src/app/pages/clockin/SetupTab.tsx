import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import {
  getClockConfig, listClockStaff, listPhones, listTakers, removePhone, removeTaker, rotateClockSecret, saveClockSettings, saveTaker, setPhoneApproved,
  type ClockConfig, type ClockMode,
} from "../../../lib/data/clockin";
import { dayText } from "../../../lib/clockin";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const MODES: { value: ClockMode; label: string; help: string }[] = [
  { value: "self", label: "Staff clock themselves in", help: "A screen shows a code that changes every 30 seconds. Staff type or scan it on their own phone." },
  { value: "taker", label: "One person takes attendance", help: "No codes. A person you choose marks staff in and out by hand." },
  { value: "both", label: "Both", help: "Staff clock in by code, and the person you choose can also mark anyone by hand." },
];

function Rules({ config }: { config: ClockConfig }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<ClockMode>(config.mode);
  const [start, setStart] = useState(config.workStart);
  const [end, setEnd] = useState(config.workEnd);
  const [grace, setGrace] = useState(String(config.graceMinutes));
  const save = useMutation({ mutationFn: () => saveClockSettings(mode, start, Number(grace), end), onSuccess: () => void qc.invalidateQueries({ queryKey: ["clockin-config"] }) });
  const dirty = mode !== config.mode || start !== config.workStart || end !== config.workEnd || grace !== String(config.graceMinutes);
  const g = Number(grace);
  const problem = !(Number.isInteger(g) && g >= 0 && g <= 120) ? "The grace period is 0 to 120 minutes." : end <= start ? "The day must end after it starts." : null;
  return (
    <section className="surface space-y-4 p-4">
      <div><h2 className="text-base font-medium">How staff clock in</h2><p className="text-sm text-muted-foreground">Turn clock-in off completely under Settings, Features.</p></div>
      <div role="radiogroup" aria-label="How staff clock in" className="grid gap-2">
        {MODES.map((m) => (
          <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} onClick={() => setMode(m.value)}
            className={`rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${mode === m.value ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}>
            <span className="block text-sm font-medium">{m.label}</span><span className="block text-xs text-muted-foreground">{m.help}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="The day starts" htmlFor="su-start"><Input id="su-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Grace period (minutes)" htmlFor="su-grace"><Input id="su-grace" type="number" min="0" max="120" inputMode="numeric" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
        <Field label="The day ends" htmlFor="su-end"><Input id="su-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted-foreground">Someone whose first clock-in is after the start plus the grace period is marked late. Late is a note on the record, never a refusal.</p>
      <FormMessage error={problem ?? (save.isError ? friendlyError(save.error) : null)} ok={save.isSuccess && !dirty ? "Saved." : null} />
      <Button type="button" disabled={save.isPending || !!problem || !dirty} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save"}</Button>
    </section>
  );
}

function Takers() {
  const qc = useQueryClient();
  const takers = useQuery({ queryKey: ["clockin-takers"], queryFn: listTakers });
  const staff = useQuery({ queryKey: ["clockin-staff"], queryFn: listClockStaff, staleTime: 5 * 60_000 });
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const refresh = () => void qc.invalidateQueries({ queryKey: ["clockin-takers"] });
  const add = useMutation({ mutationFn: () => saveTaker(who, from, until), onSuccess: () => { setWho(""); setFrom(""); setUntil(""); refresh(); } });
  const remove = useMutation({ mutationFn: (id: string) => removeTaker(id), onSuccess: refresh });
  return (
    <section className="surface space-y-3 p-4">
      <div><h2 className="text-base font-medium">Who takes attendance by hand</h2><p className="text-sm text-muted-foreground">Choose someone, for all dates or for a stretch such as one term. They can mark any member of staff in or out, and see the register.</p></div>
      {takers.isLoading ? <Skeleton className="h-10 w-full" /> : null}
      <ul className="grid gap-2">
        {(takers.data ?? []).map((t) => (
          <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <span className="min-w-0"><span className="block break-words font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.fromDate || t.untilDate ? `${t.fromDate ? "from " + dayText(t.fromDate) : "from the start"}${t.untilDate ? " to " + dayText(t.untilDate) : ""}` : "Any date"}{t.active ? "" : " · not today"}</span></span>
            <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Stop ${t.name} taking attendance`} disabled={remove.isPending} onClick={() => remove.mutate(t.id)}><Trash2 className="size-4" aria-hidden /></Button>
          </li>
        ))}
      </ul>
      {takers.data && takers.data.length === 0 ? <p className="text-sm text-muted-foreground">Nobody is chosen.</p> : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end">
        <Field label="Member of staff" htmlFor="tk-who"><NativeSelect id="tk-who" value={who} onChange={(e) => setWho(e.target.value)}><option value="">Choose</option>{(staff.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="From (optional)" htmlFor="tk-from"><Input id="tk-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="Until (optional)" htmlFor="tk-until"><Input id="tk-until" type="date" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} /></Field>
        <Button type="button" disabled={!who || add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Adding" : "Add"}</Button>
      </div>
      <FormMessage error={add.isError ? friendlyError(add.error) : remove.isError ? friendlyError(remove.error) : null} />
    </section>
  );
}

function Phones() {
  const qc = useQueryClient();
  const phones = useQuery({ queryKey: ["clockin-phones"], queryFn: listPhones });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["clockin-phones"] });
  const approve = useMutation({ mutationFn: (v: { id: string; ok: boolean }) => setPhoneApproved(v.id, v.ok), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => removePhone(id), onSuccess: refresh });
  const waiting = (phones.data ?? []).filter((p) => !p.approved);
  return (
    <section className="surface space-y-3 p-4">
      <div><h2 className="text-base font-medium">Staff phones</h2><p className="text-sm text-muted-foreground">The first phone a person clocks in from is registered as theirs. Another phone is accepted but flagged until you approve it, so a lost or new phone never stops someone clocking in.</p></div>
      {phones.isLoading ? <Skeleton className="h-10 w-full" /> : null}
      {phones.data && phones.data.length === 0 ? <p className="text-sm text-muted-foreground">No phones yet.</p> : null}
      {waiting.length > 0 ? <p role="status" className="text-sm text-amber-800 dark:text-amber-200">{waiting.length} {waiting.length === 1 ? "phone is" : "phones are"} waiting for approval.</p> : null}
      <ul className="grid gap-2">
        {(phones.data ?? []).map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-2 rounded-xl border border-border p-3 text-sm">
            <span className="min-w-0"><span className="block break-words font-medium">{p.name}</span><span className="block break-words text-xs text-muted-foreground">{p.label ?? "A phone"} · last used {dayText(p.lastSeen.slice(0, 10))}</span></span>
            <span className="flex shrink-0 items-center gap-1">
              {p.approved ? <span className="text-xs text-muted-foreground">Approved</span> : <Button type="button" size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ id: p.id, ok: true })}>Approve</Button>}
              <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Remove ${p.name}'s phone`} disabled={remove.isPending} onClick={() => remove.mutate(p.id)}><Trash2 className="size-4" aria-hidden /></Button>
            </span>
          </li>
        ))}
      </ul>
      <FormMessage error={approve.isError ? friendlyError(approve.error) : remove.isError ? friendlyError(remove.error) : null} />
    </section>
  );
}

function Secret() {
  const [sure, setSure] = useState(false);
  const rotate = useMutation({ mutationFn: rotateClockSecret, onSuccess: () => setSure(false) });
  return (
    <section className="surface space-y-2 p-4">
      <h2 className="text-base font-medium">If a code has got out</h2>
      <p className="text-sm text-muted-foreground">Codes already change every 30 seconds. If a photo of the screen has been shared around, start a new secret: every code made so far stops working at once.</p>
      {sure ? (
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="destructive" size="sm" disabled={rotate.isPending} onClick={() => rotate.mutate()}>Yes, start a new secret</Button><Button type="button" variant="ghost" size="sm" onClick={() => setSure(false)}>Keep it</Button></div>
      ) : <Button type="button" variant="outline" size="sm" onClick={() => setSure(true)}>Start a new secret</Button>}
      <FormMessage error={rotate.isError ? friendlyError(rotate.error) : null} ok={rotate.isSuccess ? "Done. The screen will show codes from the new secret." : null} />
    </section>
  );
}

export function SetupTab() {
  const config = useQuery({ queryKey: ["clockin-config"], queryFn: getClockConfig, staleTime: 30_000 });
  if (config.isLoading || !config.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-4">
      <Rules key={`${config.data.mode}${config.data.workStart}${config.data.workEnd}${config.data.graceMinutes}`} config={config.data} />
      <Takers />
      <Phones />
      <Secret />
    </div>
  );
}
