import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileSpreadsheet, Layers, User } from "lucide-react";
import {
  getClassAssessmentProgress,
  type ClassAssessmentProgress,
} from "../../../lib/data/grades";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";

export interface ClassAssessmentProgressTrackerProps {
  classId: string;
  termId: string;
  onSelectSubject?: (classSubjectId: string) => void;
  selectedClassSubjectId?: string | null;
}

export function ClassAssessmentProgressTracker({
  classId,
  termId,
  onSelectSubject,
  selectedClassSubjectId,
}: ClassAssessmentProgressTrackerProps) {
  const q = useQuery({
    queryKey: ["class-assessment-progress", classId, termId],
    queryFn: () => getClassAssessmentProgress(classId, termId),
    enabled: !!classId && !!termId,
  });

  if (q.isLoading) {
    return <Skeleton className="h-24 w-full rounded-2xl" />;
  }

  const items = q.data ?? [];
  if (items.length === 0) return null;

  const totalSubjects = items.length;
  const completedSubjects = items.filter((s) => s.completionPct >= 100).length;
  const overallPct =
    totalSubjects === 0
      ? 0
      : Math.round(
          items.reduce((sum, s) => sum + s.completionPct, 0) / totalSubjects,
        );

  return (
    <section className="surface space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <FileSpreadsheet className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Continuous Assessment Progress
            </h3>
            <div className="text-sm font-bold text-foreground">
              {completedSubjects} of {totalSubjects} Subjects Fully Graded ({overallPct}%)
            </div>
          </div>
        </div>

        {/* Mini progress bar */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-28 overflow-hidden rounded-full bg-foreground/10">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                overallPct >= 100 ? "bg-emerald-500" : "bg-primary",
              )}
              style={{ width: `${Math.min(100, overallPct)}%` }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {overallPct}%
          </span>
        </div>
      </div>

      {/* Subject Chips Grid */}
      <div className="flex flex-wrap gap-2 pt-1">
        {items.map((sub) => {
          const isComplete = sub.completionPct >= 100;
          const isSelected = selectedClassSubjectId === sub.classSubjectId;

          return (
            <button
              key={sub.classSubjectId}
              type="button"
              onClick={() => onSelectSubject?.(sub.classSubjectId)}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all text-left",
                isSelected
                  ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary shadow-xs"
                  : isComplete
                    ? "border-emerald-500/30 bg-emerald-500/5 text-foreground hover:border-emerald-500/50"
                    : sub.gradedStudents > 0
                      ? "border-amber-500/30 bg-amber-500/5 text-foreground hover:border-amber-500/50"
                      : "border-border/80 bg-foreground/[0.02] text-muted-foreground hover:border-border",
              )}
            >
              {isComplete ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
              ) : sub.gradedStudents > 0 ? (
                <Clock className="size-3.5 shrink-0 text-amber-500" />
              ) : (
                <span className="size-2 rounded-full bg-muted-foreground/30" />
              )}

              <div>
                <span className="font-semibold text-foreground mr-1.5">
                  {sub.subjectName}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {sub.gradedStudents}/{sub.enrolledStudents} ({sub.completionPct}%)
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
