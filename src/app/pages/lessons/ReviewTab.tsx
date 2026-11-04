import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getTracker, listPlans, reviewPlan, type LessonPlan, type PlanSchedule } from "../../../lib/data/lessons";
import { addDays } from "../../../lib/tasks";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { FormMessage, NativeSelect } from "../../components/fields";
import { StatusBadge, dayLabel, periodLabel } from "./shared";

function Section({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return <div><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3><p className="whitespace-pre-wrap break-words text-sm">{text}</p></div>;
}

/** A submitted plan, read in full, with a decision: approve it or send it back saying what to change. */
function ReviewDialog({ plan, label, teacher, onClose }: { plan: LessonPlan | null; label: string; teacher: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const done = () => { void qc.invalidateQueries({ queryKey: ["lesson-plans"] }); void qc.invalidateQueries({ queryKey: ["plan-tracker"] }); setSending(false); setComment(""); onClose(); };
  const decide = useMutation({ mutationFn: (d: "approved" | "changes_requested") => reviewPlan(plan!.id, d, comment), onSuccess: done });
  const canDecide = plan?.status === "submitted";
  return (
    <Dialog open={!!plan} onOpenChange={(v) => { if (!v) { setSending(false); setComment(""); onClose(); } }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {plan ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="break-words">{plan.topic}</DialogTitle>
              <DialogDescription>{label} · {teacher} · week of {dayLabel(plan.weekStart)}</DialogDescription>
            </DialogHeader>
            <StatusBadge status={plan.status} />
            <Section title="Objectives" text={plan.objectives} />
            <Section title="Activities" text={plan.activities} />
            <Section title="Resources" text={plan.resources} />
            <Section title="Homework" text={plan.homework} />
            <Section title="Notes" text={plan.notes} />
            {plan.reviewComment ? <Section title="Comment" text={plan.reviewComment} /> : null}
            {canDecide && sending ? (
              <div className="space-y-2">
                <label htmlFor="rv-comment" className="text-sm font-medium">What needs to change?</label>
                <Textarea id="rv-comment" rows={3} value={comment} maxLength={1000} onChange={(e) => setComment(e.target.value)} autoFocus />
              </div>
            ) : null}
            <FormMessage error={decide.isError ? friendlyError(decide.error) : null} />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
              {canDecide && !sending ? (
                <>
                  <Button type="button" variant="outline" onClick={() => setSending(true)}>Send back</Button>
                  <Button type="button" disabled={decide.isPending} onClick={() => decide.mutate("approved")}>{decide.isPending ? "Saving" : "Approve"}</Button>
                </>
              ) : null}
              {canDecide && sending ? <Button type="button" disabled={decide.isPending || !comment.trim()} onClick={() => decide.mutate("changes_requested")}>{decide.isPending ? "Sending" : "Send it back"}</Button> : null}
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** For those who oversee plans: who has planned for a period, and the plans waiting to be reviewed. */
export function ReviewTab({ schedule }: { schedule: PlanSchedule }) {
  const { can } = useCapabilities();
  const days = 7 * schedule.periodWeeks;
  const periods = useMemo(() => [
    { key: "next", label: "Next period", p: schedule.next },
    { key: "current", label: "This period", p: schedule.current },
    { key: "previous", label: "Last period", p: { start: addDays(schedule.current.start, -days), end: addDays(schedule.current.start, -1), dueOn: addDays(schedule.current.dueOn, -days) } },
  ], [schedule, days]);
  const [pick, setPick] = useState("current");
  const period = periods.find((x) => x.key === pick)!.p;
  const [show, setShow] = useState<"all" | "waiting" | "missing">("all");
  const [open, setOpen] = useState<{ plan: LessonPlan; label: string; teacher: string } | null>(null);

  const tracker = useQuery({ queryKey: ["plan-tracker", period.start], queryFn: () => getTracker(period.start) });
  const plans = useQuery({ queryKey: ["lesson-plans"], queryFn: listPlans, staleTime: 15_000 });
  const rows = tracker.data ?? [];
  const submitted = rows.filter((r) => r.status === "submitted" || r.status === "approved").length;
  const waiting = rows.filter((r) => r.status === "submitted").length;
  const list = rows.filter((r) => show === "all" || (show === "waiting" ? r.status === "submitted" : !r.status || r.status === "draft" || r.status === "changes_requested"));

  const openPlan = (planId: string | null, label: string, teacher: string) => {
    const plan = (plans.data ?? []).find((p) => p.id === planId);
    if (plan) setOpen({ plan, label, teacher });
  };

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="w-full sm:w-56">
          <label htmlFor="rt-period" className="mb-1 block text-xs text-muted-foreground">Plan period</label>
          <NativeSelect id="rt-period" value={pick} onChange={(e) => setPick(e.target.value)}>{periods.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</NativeSelect>
        </div>
        <div className="text-sm">
          <p className="font-medium">{periodLabel(period)}</p>
          <p className="tabular-nums text-muted-foreground">Due {dayLabel(period.dueOn)} · {submitted} of {rows.length} submitted{waiting > 0 ? ` · ${waiting} waiting for review` : ""}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
          {([["all", "Everyone"], ["waiting", "To review"], ["missing", "Not submitted"]] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={show === v} onClick={() => setShow(v)}
              className={`min-h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${show === v ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}>{label}</button>
          ))}
        </div>
        {can("lessons.download") ? (
          <DownloadMenu action="lessons.download" label="Download" disabled={rows.length === 0} getTable={() => ({
            title: "Lesson plan tracker", subtitle: periodLabel(period), filename: "lesson-plan-tracker",
            columns: ["Teacher", "Class", "Subject", "Status", "Topic"],
            rows: rows.map((r) => [r.teacherName, r.classLabel, r.subjectName, r.status ?? "not started", r.topic ?? ""]),
          })} />
        ) : null}
      </div>

      {tracker.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {tracker.isError ? <p role="alert" className="surface p-4 text-sm">The tracker could not be loaded.</p> : null}
      {tracker.data && list.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">{show === "waiting" ? "Nothing is waiting for review." : "Nobody to show."}</p> : null}
      <ul className="grid gap-2">
        {list.map((r) => (
          <li key={r.classSubjectId}>
            <button type="button" disabled={!r.planId} onClick={() => openPlan(r.planId, `${r.subjectName}, ${r.classLabel}`, r.teacherName)}
              className="surface flex min-h-14 w-full items-start justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:cursor-default">
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{r.teacherName}</span>
                <span className="block break-words text-xs text-muted-foreground">{r.subjectName}, {r.classLabel}{r.topic ? ` · ${r.topic}` : ""}</span>
              </span>
              <StatusBadge status={r.status} requireReview={schedule.requireReview} />
            </button>
          </li>
        ))}
      </ul>
      <ReviewDialog plan={open?.plan ?? null} label={open?.label ?? ""} teacher={open?.teacher ?? ""} onClose={() => setOpen(null)} />
    </div>
  );
}
