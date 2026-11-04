import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { listAcademicYears, listTerms, getInstitutionDetails } from "../../../lib/data/setup";
import { copyEvents, listEvents, publishEvents } from "../../../lib/data/calendar";
import { friendlyError } from "../../../lib/data/errors";
import {
  KIND_LABELS, MONTH_NAMES, WEEKDAY_NAMES, dayLabel, eventsOnDay, formatRange, monthGrid, sortEvents, toKey,
  type CalEvent, type EventKind,
} from "../../../lib/calendar";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { CalendarDownload, type Scope } from "./CalendarDownload";
import { EventDialog } from "./EventDialog";

const KIND_CLASS: Record<EventKind, string> = {
  event: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  holiday: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  exam: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
  meeting: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
  deadline: "bg-orange-500/15 text-orange-800 dark:text-orange-200",
  trip: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200",
};

function todayKey(): string {
  const d = new Date();
  return toKey(d.getFullYear(), d.getMonth(), d.getDate());
}

function Chip({ e, onOpen, compact }: { e: CalEvent; onOpen: (e: CalEvent) => void; compact?: boolean }) {
  return (
    <button
      type="button" onClick={() => onOpen(e)} title={`${e.title}, ${formatRange(e)}`}
      className={cn(
        "block w-full rounded px-1.5 py-0.5 text-left text-[11px] leading-tight focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
        KIND_CLASS[e.kind], !e.published && "border border-dashed border-current/50 opacity-80", compact ? "truncate" : "break-words",
      )}
    >
      {e.startsAt ? <span className="tabular-nums opacity-70">{e.startsAt.slice(0, 5)} </span> : null}{e.title}
    </button>
  );
}

/** Copying one term's events forward and publishing a term, for the people who manage the calendar. */
function TermTools({ scopes }: { scopes: Scope[] }) {
  const qc = useQueryClient();
  const terms = scopes.filter((s) => s.id.startsWith("term:"));
  const [fromId, setFromId] = useState(terms[0]?.id ?? "");
  const [toId, setToId] = useState(terms[1]?.id ?? terms[0]?.id ?? "");
  const [pubId, setPubId] = useState(terms[0]?.id ?? "");
  const from = terms.find((t) => t.id === fromId);
  const to = terms.find((t) => t.id === toId);
  const pub = terms.find((t) => t.id === pubId);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["calendar"] });

  const copy = useMutation({ mutationFn: () => copyEvents(from!.from, from!.to, to!.from), onSuccess: refresh });
  const publish = useMutation({ mutationFn: () => publishEvents(pub!.from, pub!.to), onSuccess: refresh });
  const drafts = useQuery({
    queryKey: ["calendar", "drafts", pub?.from, pub?.to],
    queryFn: async () => (await listEvents(pub!.from, pub!.to)).filter((e) => !e.published).length,
    enabled: !!pub,
  });

  if (terms.length === 0) return null;
  return (
    <details className="surface group p-4">
      <summary className="cursor-pointer list-none text-base font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
        Term tools <span className="text-xs font-normal text-muted-foreground">copy last term&apos;s events, publish a term</span>
      </summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <section className="space-y-3" aria-label="Copy events to another term">
          <h3 className="text-sm font-semibold">Copy events to a new term</h3>
          <p className="text-xs text-muted-foreground">Dates move to match the new term and the copies start as drafts, so you can check them before anyone sees them. Copying twice never doubles an event.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Copy from" htmlFor="copy-from">
              <NativeSelect id="copy-from" value={fromId} onChange={(e) => { setFromId(e.target.value); copy.reset(); }}>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Copy to" htmlFor="copy-to">
              <NativeSelect id="copy-to" value={toId} onChange={(e) => { setToId(e.target.value); copy.reset(); }}>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <FormMessage
            error={copy.isError ? friendlyError(copy.error) : fromId === toId ? "Choose two different terms." : null}
            ok={copy.isSuccess ? (copy.data === 0 ? "Nothing new to copy." : `${copy.data} ${copy.data === 1 ? "event was" : "events were"} copied as drafts.`) : null}
          />
          <Button type="button" size="sm" variant="outline" disabled={!from || !to || fromId === toId || copy.isPending} onClick={() => copy.mutate()}>
            {copy.isPending ? "Copying" : "Copy events"}
          </Button>
        </section>

        <section className="space-y-3" aria-label="Publish a term">
          <h3 className="text-sm font-semibold">Publish a term</h3>
          <p className="text-xs text-muted-foreground">Makes every draft in the term visible to the people it is for, and tells staff and parents once.</p>
          <Field label="Term" htmlFor="pub-term">
            <NativeSelect id="pub-term" value={pubId} onChange={(e) => { setPubId(e.target.value); publish.reset(); }}>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </NativeSelect>
          </Field>
          <p className="text-xs tabular-nums text-muted-foreground" role="status">
            {drafts.isLoading ? "Counting drafts…" : `${drafts.data ?? 0} ${drafts.data === 1 ? "draft" : "drafts"} waiting`}
          </p>
          <FormMessage
            error={publish.isError ? friendlyError(publish.error) : null}
            ok={publish.isSuccess ? (publish.data === 0 ? "Nothing to publish." : `${publish.data} ${publish.data === 1 ? "event is" : "events are"} now published.`) : null}
          />
          <Button type="button" size="sm" disabled={!pub || !drafts.data || publish.isPending} onClick={() => publish.mutate()}>
            {publish.isPending ? "Publishing" : "Publish drafts"}
          </Button>
        </section>
      </div>
    </details>
  );
}

export default function Calendar() {
  const { can } = useCapabilities();
  const canManage = can("calendar.manage");
  const canDownload = can("calendar.download");

  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears, staleTime: 5 * 60_000 });
  const terms = useQuery({ queryKey: ["terms"], queryFn: listTerms, staleTime: 5 * 60_000 });
  const school = useQuery({ queryKey: ["institution-details"], queryFn: getInstitutionDetails, staleTime: 5 * 60_000 });
  const year = years.data?.find((y) => y.isCurrent) ?? years.data?.[0] ?? null;

  const scopes = useMemo<Scope[]>(() => {
    const out: Scope[] = (terms.data ?? []).filter((t) => t.academicYearId === year?.id)
      .map((t) => ({ id: `term:${t.id}`, label: t.name, from: t.startDate, to: t.endDate }));
    if (year) out.push({ id: "year", label: `Whole year ${year.name}`, from: year.startDate, to: year.endDate });
    return out;
  }, [terms.data, year]);
  const currentTermScope = (() => {
    const cur = (terms.data ?? []).find((t) => t.isCurrent);
    return cur ? `term:${cur.id}` : scopes[0]?.id ?? "year";
  })();

  const today = todayKey();
  const t = new Date();
  const [view, setView] = useState({ year: t.getFullYear(), month: t.getMonth() });
  const [dialog, setDialog] = useState<{ event: CalEvent | null; day: string } | null>(null);

  const weeks = useMemo(() => monthGrid(view.year, view.month), [view]);
  const gridFrom = weeks[0][0].key;
  const gridTo = weeks[weeks.length - 1][6].key;
  const list = useQuery({ queryKey: ["calendar", gridFrom, gridTo], queryFn: () => listEvents(gridFrom, gridTo) });
  const events = list.data ?? [];

  const monthStart = toKey(view.year, view.month, 1);
  const monthEnd = toKey(view.year, view.month, new Date(view.year, view.month + 1, 0).getDate());
  const inMonth = sortEvents(events.filter((e) => e.endsOn >= monthStart && e.startsOn <= monthEnd));
  const move = (delta: number) => setView((v) => { const d = new Date(v.year, v.month + delta, 1); return { year: d.getFullYear(), month: d.getMonth() }; });
  const open = (e: CalEvent | null, day: string) => setDialog({ event: e, day });
  const kindsShown = [...new Set(events.map((e) => e.kind))];

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><CalendarDays className="size-6 text-primary" aria-hidden /> Calendar</h1>
          <p className="text-sm text-muted-foreground">{year ? `Dates for ${year.name}.` : "Dates for the term."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canDownload ? (
            <CalendarDownload scopes={scopes} defaultScope={currentTermScope} schoolName={school.data?.name ?? ""} canSeeDrafts={canManage} />
          ) : null}
          {canManage ? (
            <Button type="button" size="sm" onClick={() => open(null, today)}><Plus className="size-4" aria-hidden /> Add event</Button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold" aria-live="polite">{MONTH_NAMES[view.month]} {view.year}</h2>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setView({ year: t.getFullYear(), month: t.getMonth() })}>Today</Button>
          <Button type="button" size="icon" variant="outline" aria-label="Previous month" onClick={() => move(-1)}><ChevronLeft className="size-4" aria-hidden /></Button>
          <Button type="button" size="icon" variant="outline" aria-label="Next month" onClick={() => move(1)}><ChevronRight className="size-4" aria-hidden /></Button>
        </div>
      </div>

      {list.isError ? <p role="alert" className="surface p-4 text-sm">The calendar could not be loaded.</p> : null}

      {/* Larger screens: a month grid. Tap a day's number to add an event there. */}
      <section className="surface hidden overflow-hidden sm:block" aria-label={`${MONTH_NAMES[view.month]} ${view.year}`}>
        <div className="grid grid-cols-7 border-b border-border bg-foreground/[0.03] text-xs font-medium text-muted-foreground">
          {WEEKDAY_NAMES.map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {weeks.flat().map((c) => {
            const day = eventsOnDay(events, c.key);
            return (
              <div key={c.key} className={cn("min-h-24 min-w-0 space-y-1 border-b border-r border-border p-1.5", !c.inMonth && "bg-foreground/[0.03] text-muted-foreground")}>
                {canManage ? (
                  <button
                    type="button" onClick={() => open(null, c.key)} aria-label={`Add an event on ${dayLabel(c.key, true)}`}
                    className={cn("grid size-6 place-items-center rounded-full text-xs font-medium hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-[var(--ring)]", c.key === today && "bg-primary text-primary-foreground hover:bg-primary")}
                  >{c.day}</button>
                ) : (
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs font-medium", c.key === today && "bg-primary text-primary-foreground")}>{c.day}</span>
                )}
                {day.slice(0, 3).map((e) => <Chip key={e.id} e={e} onOpen={(x) => open(x, c.key)} compact />)}
                {day.length > 3 ? <p className="px-1 text-[11px] text-muted-foreground">+{day.length - 3} more</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      {/* Phones: a list of what is on this month, in date order. */}
      <section className="space-y-2 sm:hidden" aria-label="Events this month">
        {list.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        {!list.isLoading && inMonth.length === 0 ? (
          <p className="surface p-5 text-center text-sm text-muted-foreground">Nothing on this month.{canManage ? " Tap Add event to put something on the calendar." : ""}</p>
        ) : null}
        <ul className="space-y-2">
          {inMonth.map((e) => (
            <li key={e.id}>
              <button
                type="button" onClick={() => open(e, e.startsOn)}
                className={cn("surface flex min-h-14 w-full items-start gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]", !e.published && "border-dashed")}
              >
                <span className={cn("mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", KIND_CLASS[e.kind])}>{KIND_LABELS[e.kind]}</span>
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium">{e.title}{!e.published ? <span className="ml-2 text-xs font-normal text-muted-foreground">Draft</span> : null}</span>
                  <span className="block text-xs text-muted-foreground">{formatRange(e)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {kindsShown.length > 0 ? (
        <ul className="flex flex-wrap gap-2 text-xs" aria-label="Key">
          {kindsShown.map((k) => <li key={k} className={cn("rounded-full px-2.5 py-1", KIND_CLASS[k])}>{KIND_LABELS[k]}</li>)}
          {canManage ? <li className="rounded-full border border-dashed border-border px-2.5 py-1 text-muted-foreground">Draft</li> : null}
        </ul>
      ) : null}

      {canManage ? <TermTools scopes={scopes} /> : null}

      <EventDialog
        open={dialog !== null} onClose={() => setDialog(null)} event={dialog?.event ?? null}
        day={dialog?.day ?? today} canManage={canManage}
      />
    </div>
  );
}
