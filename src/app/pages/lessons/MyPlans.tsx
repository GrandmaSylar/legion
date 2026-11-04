import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMyClassSubjects, listPlans, type LessonPlan, type MyClassSubject, type PlanSchedule } from "../../../lib/data/lessons";
import { addDays } from "../../../lib/tasks";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { Skeleton } from "../../components/ui/skeleton";
import { NativeSelect } from "../../components/fields";
import { PlanDialog } from "./PlanDialog";
import { StatusBadge, dayLabel, periodLabel } from "./shared";
import { todayKey } from "../tasks/TaskRow";

/** A teacher's plans: pick a period, and each class and subject they teach shows its plan and status. */
export function MyPlans({ schedule }: { schedule: PlanSchedule }) {
  const { profile } = useAuth();
  const me = profile?.id ?? "";
  const subjects = useQuery({ queryKey: ["my-class-subjects", me], queryFn: () => listMyClassSubjects(me), enabled: !!me, staleTime: 60_000 });
  const plans = useQuery({ queryKey: ["lesson-plans"], queryFn: listPlans, staleTime: 15_000 });
  const days = 7 * schedule.periodWeeks;
  const periods = useMemo(() => [
    { key: "next", label: "Next period", p: schedule.next },
    { key: "current", label: "This period", p: schedule.current },
    { key: "previous", label: "Last period", p: { start: addDays(schedule.current.start, -days), end: addDays(schedule.current.start, -1), dueOn: addDays(schedule.current.dueOn, -days) } },
  ], [schedule, days]);
  const [pick, setPick] = useState("next");
  const period = periods.find((x) => x.key === pick)!.p;
  const [open, setOpen] = useState<{ target: MyClassSubject; plan: LessonPlan | null } | null>(null);
  const today = todayKey();

  const mine = useMemo(() => (plans.data ?? []).filter((p) => p.authorId === me), [plans.data, me]);
  const planFor = (cs: string) => mine.find((p) => p.classSubjectId === cs && p.weekStart === period.start) ?? null;
  const overdue = period.dueOn < today;

  if (subjects.isLoading || plans.isLoading) return <Skeleton className="h-24 w-full" />;
  if (subjects.data && subjects.data.length === 0) {
    return <p className="surface p-6 text-center text-sm text-muted-foreground">You are not down to teach any class this year, so there is nothing to plan. Ask the school office if this looks wrong.</p>;
  }
  const missing = (subjects.data ?? []).filter((s) => !["submitted", "approved"].includes(planFor(s.id)?.status ?? "")).length;

  return (
    <div className="space-y-4">
      <div className="surface flex flex-wrap items-end justify-between gap-3 p-4">
        <div className="w-full sm:w-56">
          <label htmlFor="mp-period" className="mb-1 block text-xs text-muted-foreground">Plan period</label>
          <NativeSelect id="mp-period" value={pick} onChange={(e) => setPick(e.target.value)}>
            {periods.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </NativeSelect>
        </div>
        <div className="text-sm">
          <p className="font-medium">{periodLabel(period)}</p>
          <p className={overdue && missing > 0 ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
            Due {dayLabel(period.dueOn)}{overdue && missing > 0 ? ` · ${missing} still to submit` : missing === 0 ? " · all submitted" : ` · ${missing} to go`}
          </p>
        </div>
      </div>

      <ul className="grid gap-2">
        {(subjects.data ?? []).map((s) => {
          const plan = planFor(s.id);
          return (
            <li key={s.id}>
              <button
                type="button" onClick={() => setOpen({ target: s, plan })}
                className="surface flex min-h-14 w-full items-start justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium">{s.subjectName}, {s.classLabel}</span>
                  <span className="block break-words text-xs text-muted-foreground">{plan ? plan.topic : "No plan yet. Tap to write one."}</span>
                  {plan?.status === "changes_requested" && plan.reviewComment ? <span className="mt-1 block break-words text-xs text-amber-700 dark:text-amber-300">Sent back: {plan.reviewComment}</span> : null}
                </span>
                <StatusBadge status={plan?.status ?? null} requireReview={schedule.requireReview} />
              </button>
            </li>
          );
        })}
      </ul>

      <PlanDialog open={open !== null} onClose={() => setOpen(null)} target={open?.target ?? null} plan={open?.plan ?? null} period={period} requireReview={schedule.requireReview} />
    </div>
  );
}
