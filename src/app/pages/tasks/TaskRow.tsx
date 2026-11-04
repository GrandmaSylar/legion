import { Check, MapPin, RotateCcw } from "lucide-react";
import { KIND_LABELS, myState, taskState, whenLabel } from "../../../lib/tasks";
import type { Task } from "../../../lib/data/tasks";
import { Button } from "../../components/ui/button";
import { cn } from "../../components/ui/utils";

export const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const KIND_CLASS: Record<Task["kind"], string> = {
  duty: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  invigilation: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
  meeting: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
  other: "bg-foreground/10 text-muted-foreground",
};

/**
 * One task. If the signed-in person has a part in it, a single tap ticks it off (or reopens it). Anyone who
 * oversees tasks also sees how far everyone has got.
 */
export function TaskRow({
  task, me, names, onToggle, busy, onOpen, compact,
}: {
  task: Task; me: string; names?: Map<string, string>; onToggle?: (done: boolean) => void; busy?: boolean; onOpen?: () => void; compact?: boolean;
}) {
  const today = todayKey();
  const mine = myState(task, me, today);
  const overall = taskState(task, today);
  const done = task.people.filter((p) => p.status === "done").length;
  const overdue = (mine ?? overall) === "overdue";

  return (
    <div className={cn("flex items-start gap-3", compact ? "py-2" : "surface p-3", overdue && "border-amber-500/50")}>
      {mine && onToggle ? (
        <button
          type="button" disabled={busy} onClick={() => onToggle(mine !== "done")}
          aria-label={mine === "done" ? `Mark ${task.title} as not done` : `Mark ${task.title} as done`}
          aria-pressed={mine === "done"}
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:opacity-60",
            mine === "done" ? "border-emerald-500 bg-emerald-500 text-white" : "border-border hover:border-primary hover:bg-primary/10",
          )}
        >
          {mine === "done" ? <Check className="size-4" aria-hidden /> : <span className="size-3 rounded-full border border-muted-foreground/50" aria-hidden />}
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button" onClick={onOpen} disabled={!onOpen}
            className={cn("break-words text-left text-sm font-medium", onOpen && "hover:underline", mine === "done" && "text-muted-foreground line-through")}
          >{task.title}</button>
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", KIND_CLASS[task.kind])}>{KIND_LABELS[task.kind]}</span>
          {overdue ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">Overdue</span> : null}
          {task.rotaId ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><RotateCcw className="size-3" aria-hidden /> Rota</span> : null}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {whenLabel(task)}
          {task.location ? <span className="ml-2 inline-flex items-center gap-1"><MapPin className="size-3" aria-hidden />{task.location}</span> : null}
        </p>
        {task.description && !compact ? <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">{task.description}</p> : null}
        {names ? (
          <p className="mt-1 break-words text-xs text-muted-foreground">
            {task.people.map((p) => `${names.get(p.profileId) ?? "Someone"}${p.status === "done" ? " ✓" : ""}`).join(", ")}
            {task.people.length > 1 ? ` · ${done} of ${task.people.length} done` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function DoneButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClick}><Check className="size-4" aria-hidden /> Done</Button>;
}
