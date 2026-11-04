import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks } from "lucide-react";
import { listTasks, setMyTaskDone } from "../../../lib/data/tasks";
import { addDays, myState } from "../../../lib/tasks";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { Skeleton } from "../../components/ui/skeleton";
import { TaskRow, todayKey } from "./TaskRow";

/** The Overview's list of the signed-in person's open tasks, with a one-tap Done. */
export function MyTasksPanel() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const me = profile?.id ?? "";
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: listTasks, staleTime: 30_000, retry: false });
  const toggle = useMutation({
    mutationFn: (v: { id: string; done: boolean }) => setMyTaskDone(v.id, v.done),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const today = todayKey();
  const soon = addDays(today, 14);
  // What is still to do: anything overdue, and what falls in the next two weeks.
  const mine = (tasks.data ?? [])
    .filter((t) => myState(t, me, today) !== null && myState(t, me, today) !== "done" && t.startsOn <= soon)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const shown = mine.slice(0, 5);

  if (tasks.isError) return null;
  return (
    <section className="surface lift p-4 sm:p-5" aria-label="My tasks">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold"><ListChecks className="size-4 text-primary" aria-hidden /> My tasks</h2>
        <Link to="/tasks" className="text-xs font-medium text-primary underline-offset-4 hover:underline">See all</Link>
      </div>
      {tasks.isLoading ? <Skeleton className="h-14 w-full" /> : null}
      {tasks.data && mine.length === 0 ? <p className="text-sm text-muted-foreground">Nothing for you to do. You are all caught up.</p> : null}
      <ul className="divide-y divide-border">
        {shown.map((t) => (
          <li key={t.id}>
            <TaskRow task={t} me={me} compact busy={toggle.isPending} onToggle={(done) => toggle.mutate({ id: t.id, done })} />
          </li>
        ))}
      </ul>
      {mine.length > shown.length ? <p className="mt-2 text-xs text-muted-foreground">and {mine.length - shown.length} more</p> : null}
    </section>
  );
}
