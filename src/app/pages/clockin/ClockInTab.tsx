import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { clockIn, flushQueue, getClockConfig, listMyEntries, readQueue, type ClockOutcome } from "../../../lib/data/clockin";
import { cleanCode, dayText, timeText } from "../../../lib/clockin";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Flags } from "./shared";

type Direction = "auto" | "in" | "out";

function Result({ r }: { r: ClockOutcome }) {
  if (!r.ok) return <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">{r.error}</p>;
  if (r.queued) return <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">There is no signal. Your scan is saved on this phone and will be sent as soon as you are online.</p>;
  if (r.duplicate) return <p role="status" className="rounded-xl bg-foreground/5 p-3 text-sm">You clocked in a moment ago, so that scan was not counted again.</p>;
  return (
    <div role="status" className="space-y-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
      <p className="font-medium">You are clocked {r.kind} at {timeText(r.at ?? new Date().toISOString())}.</p>
      {r.flags && r.flags.length > 0 ? <Flags flags={r.flags} /> : null}
    </div>
  );
}

/** A member of staff clocks in or out by typing the code on the screen (or arriving from its QR code), and sees their own record. */
export function ClockInTab() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const config = useQuery({ queryKey: ["clockin-config"], queryFn: getClockConfig, staleTime: 60_000 });
  const entries = useQuery({ queryKey: ["clockin-mine"], queryFn: () => listMyEntries(14), staleTime: 10_000 });
  const [code, setCode] = useState("");
  const [dir, setDir] = useState<Direction>("auto");
  const [result, setResult] = useState<ClockOutcome | null>(null);
  const [waiting, setWaiting] = useState(readQueue().length);

  const refresh = useCallback(() => { void qc.invalidateQueries({ queryKey: ["clockin-mine"] }); void qc.invalidateQueries({ queryKey: ["clockin-roster"] }); }, [qc]);
  // Runs even with no signal: clockIn keeps the scan on the phone and sends it later.
  const go = useMutation({
    networkMode: "always",
    mutationFn: (v: { code: string; dir: Direction }) => clockIn(v.code, v.dir === "auto" ? null : v.dir),
    onSuccess: (r) => { setResult(r); setWaiting(readQueue().length); if (r.ok) setCode(""); refresh(); },
  });

  // Send anything kept while offline whenever the phone is back online, and once when the screen opens.
  useEffect(() => {
    const run = () => { if (readQueue().length === 0) return; void flushQueue().then(() => { setWaiting(readQueue().length); refresh(); }); };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [refresh]);

  // Arriving from the QR code: the code is in the link, so it is used once and taken out of the address.
  const fromLink = useRef(false);
  useEffect(() => {
    const c = cleanCode(params.get("c") ?? "");
    if (c.length === 6 && !fromLink.current && config.data && config.data.mode !== "taker") {
      fromLink.current = true;
      go.mutate({ code: c, dir: "auto" });
      const next = new URLSearchParams(params); next.delete("c"); setParams(next, { replace: true });
    }
  }, [params, setParams, config.data, go]);

  const submit = (e: FormEvent) => { e.preventDefault(); setResult(null); go.mutate({ code, dir }); };
  const byDay = useMemo(() => {
    const m = new Map<string, NonNullable<typeof entries.data>>();
    for (const e of entries.data ?? []) m.set(e.day, [...(m.get(e.day) ?? []), e]);
    return [...m.entries()];
  }, [entries.data]);

  if (config.isLoading) return <Skeleton className="h-40 w-full" />;
  const byHandOnly = config.data?.mode === "taker";

  return (
    <div className="space-y-4">
      {byHandOnly ? (
        <p className="surface p-4 text-sm">At this school someone is chosen to take staff attendance, so you do not need to clock in yourself. Your record is below.</p>
      ) : (
        <form onSubmit={submit} className="surface space-y-3 p-4">
          <div>
            <label htmlFor="ci-code" className="text-sm font-medium">The code on the screen</label>
            <p className="text-xs text-muted-foreground">It changes every 30 seconds. You can also scan the screen&apos;s square code with your phone&apos;s camera.</p>
          </div>
          <Input
            id="ci-code" value={code} onChange={(e) => setCode(cleanCode(e.target.value))} inputMode="numeric" autoComplete="one-time-code"
            placeholder="000000" className="h-14 text-center text-2xl tracking-[0.4em] tabular-nums"
          />
          <div role="radiogroup" aria-label="Direction" className="flex flex-wrap gap-2">
            {([["auto", "Automatic"], ["in", "Clock in"], ["out", "Clock out"]] as const).map(([v, label]) => (
              <button key={v} type="button" role="radio" aria-checked={dir === v} onClick={() => setDir(v)}
                className={`min-h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${dir === v ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}>{label}</button>
            ))}
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={go.isPending || code.length !== 6}>{go.isPending ? "Sending" : dir === "auto" ? "Clock in or out" : dir === "in" ? "Clock in" : "Clock out"}</Button>
          {go.isError ? <p role="alert" className="text-sm text-destructive">{friendlyError(go.error)}</p> : null}
          {result ? <Result r={result} /> : null}
          {waiting > 0 && !result?.queued ? <p role="status" className="text-xs text-muted-foreground">{waiting} {waiting === 1 ? "scan is" : "scans are"} waiting on this phone to be sent.</p> : null}
        </form>
      )}

      <section aria-label="My record" className="space-y-2">
        <h2 className="text-base font-medium">My last two weeks</h2>
        {entries.isLoading ? <Skeleton className="h-16 w-full" /> : null}
        {entries.data && byDay.length === 0 ? <p className="surface p-5 text-center text-sm text-muted-foreground">Nothing yet.</p> : null}
        <ul className="grid gap-2">
          {byDay.map(([day, list]) => (
            <li key={day} className="surface space-y-1 p-3">
              <p className="text-sm font-medium">{dayText(day)}</p>
              <ul className="space-y-1">
                {[...list].reverse().map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-16 tabular-nums">{timeText(e.capturedAt)}</span>
                    <span className="w-20">{e.kind === "in" ? "Clocked in" : "Clocked out"}</span>
                    {e.source === "marked" ? <span className="text-xs text-muted-foreground">marked by the office</span> : null}
                    <Flags flags={e.flags} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
