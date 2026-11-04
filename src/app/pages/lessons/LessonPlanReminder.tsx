import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck } from "lucide-react";
import { getPlanSchedule, listMyClassSubjects, listPlans } from "../../../lib/data/lessons";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { todayKey } from "../tasks/TaskRow";
import { addDays } from "../../../lib/tasks";
import { dayLabel, periodLabel } from "./shared";

/**
 * A line on a teacher's Overview when plans for the next period are still to be submitted and the due day is
 * near or has passed. It says nothing when they are all in, or when the teacher has nothing to plan.
 */
export function LessonPlanReminder() {
  const { profile } = useAuth();
  const me = profile?.id ?? "";
  const schedule = useQuery({ queryKey: ["plan-schedule"], queryFn: getPlanSchedule, staleTime: 60_000, retry: false });
  const subjects = useQuery({ queryKey: ["my-class-subjects", me], queryFn: () => listMyClassSubjects(me), enabled: !!me, staleTime: 60_000, retry: false });
  const plans = useQuery({ queryKey: ["lesson-plans"], queryFn: listPlans, staleTime: 30_000, retry: false });
  if (!schedule.data || !subjects.data || !plans.data || subjects.data.length === 0) return null;

  const today = todayKey();
  const next = schedule.data.next;
  // Plans for the next period are due on its due date; remind from a week before.
  if (today < addDays(next.dueOn, -7)) return null;
  const done = new Set(plans.data.filter((p) => p.authorId === me && p.weekStart === next.start && ["submitted", "approved"].includes(p.status)).map((p) => p.classSubjectId));
  const missing = subjects.data.filter((s) => !done.has(s.id)).length;
  if (missing === 0) return null;
  const late = next.dueOn < today;

  return (
    <section role="status" className={`surface lift flex items-start gap-3 p-4 text-sm ${late ? "border-amber-500/50" : ""}`} aria-label="Lesson plans due">
      <BookOpenCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 flex-1">
        {missing} lesson {missing === 1 ? "plan" : "plans"} for {periodLabel(next)} {late ? "should have been in by" : "due by"} {dayLabel(next.dueOn)}.{" "}
        <Link to="/lessons" className="font-medium text-primary underline-offset-4 hover:underline">Write {missing === 1 ? "it" : "them"}</Link>
      </p>
    </section>
  );
}
