import { STATUS_LABELS, type PlanPeriod, type PlanStatus } from "../../../lib/data/lessons";
import { whenLabel } from "../../../lib/tasks";
import { cn } from "../../components/ui/utils";

const STYLE: Record<PlanStatus, string> = {
  draft: "bg-foreground/10 text-muted-foreground",
  submitted: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  approved: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  changes_requested: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
};

export function StatusBadge({ status, requireReview = true }: { status: PlanStatus | null; requireReview?: boolean }) {
  if (!status) return <span className="rounded-full bg-foreground/5 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Not started</span>;
  const label = status === "submitted" && requireReview ? "Waiting for review" : STATUS_LABELS[status];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STYLE[status])}>{label}</span>;
}

/** "Mon 9 Nov to Sun 15 Nov" */
export const periodLabel = (p: Pick<PlanPeriod, "start" | "end">) => whenLabel({ startsOn: p.start, endsOn: p.end, startsAt: null, endsAt: null });

export const dayLabel = (key: string) => whenLabel({ startsOn: key, endsOn: key, startsAt: null, endsAt: null });
