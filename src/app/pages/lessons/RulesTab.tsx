import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { savePlanSettings, type PlanSchedule } from "../../../lib/data/lessons";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Switch } from "../../components/ui/switch";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { dayLabel, periodLabel } from "./shared";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** How often plans are due, when, and whether the head reviews them. One school's choice. */
export function RulesTab({ schedule }: { schedule: PlanSchedule }) {
  const qc = useQueryClient();
  const [weeks, setWeeks] = useState(String(schedule.periodWeeks));
  const [due, setDue] = useState(String(schedule.dueWeekday));
  const [review, setReview] = useState(schedule.requireReview);
  const save = useMutation({
    mutationFn: () => savePlanSettings(Number(weeks), Number(due), review),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["plan-schedule"] }); },
  });
  const w = Number(weeks);
  const problem = !(Number.isInteger(w) && w >= 1 && w <= 12) ? "A plan can cover between 1 and 12 weeks." : null;
  const dirty = weeks !== String(schedule.periodWeeks) || due !== String(schedule.dueWeekday) || review !== schedule.requireReview;

  return (
    <div className="space-y-4">
      <section className="surface space-y-4 p-4">
        <div>
          <h2 className="text-base font-medium">How often plans are due</h2>
          <p className="text-sm text-muted-foreground">Teachers plan each class and subject for a period of weeks. Periods are counted from the first Monday of the current term, so everyone&apos;s weeks line up.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="A plan covers (weeks)" htmlFor="rl-weeks"><Input id="rl-weeks" type="number" min="1" max="12" inputMode="numeric" value={weeks} onChange={(e) => setWeeks(e.target.value)} /></Field>
          <Field label="Plans are due on" htmlFor="rl-due">
            <NativeSelect id="rl-due" value={due} onChange={(e) => setDue(e.target.value)}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d} before the period begins</option>)}</NativeSelect>
          </Field>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <label htmlFor="rl-review" className="block text-sm font-medium">The head reviews plans</label>
            <p className="text-xs text-muted-foreground">When on, a submitted plan waits for approval or a comment. When off, submitting is enough.</p>
          </div>
          <Switch id="rl-review" checked={review} onCheckedChange={setReview} aria-label={`The head reviews plans: ${review ? "on" : "off"}`} />
        </div>
        <FormMessage error={problem ?? (save.isError ? friendlyError(save.error) : null)} ok={save.isSuccess && !dirty ? "Saved. The change takes effect straight away." : null} />
        <Button type="button" disabled={save.isPending || !!problem || !dirty} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save"}</Button>
      </section>
      <section className="surface space-y-1 p-4 text-sm" aria-label="Right now">
        <h3 className="text-sm font-semibold">Right now</h3>
        <p className="text-muted-foreground">This period: {periodLabel(schedule.current)}. Plans were due {dayLabel(schedule.current.dueOn)}.</p>
        <p className="text-muted-foreground">Next period: {periodLabel(schedule.next)}. Plans are due {dayLabel(schedule.next.dueOn)}.</p>
      </section>
    </div>
  );
}
