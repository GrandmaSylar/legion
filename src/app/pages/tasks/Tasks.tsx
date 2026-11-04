import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ListChecks, Plus } from "lucide-react";
import { listAssignableStaff, listRotas, listTasks, setMyTaskDone, type Rota, type Task } from "../../../lib/data/tasks";
import { KIND_LABELS, myState, taskState, whenLabel, type TaskKind } from "../../../lib/tasks";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { TabsContent } from "../../components/ui/tabs";
import { SectionTabs } from "../../components/SectionTabs";
import { DownloadMenu } from "../../components/DownloadMenu";
import { NativeSelect } from "../../components/fields";
import { TaskRow, todayKey } from "./TaskRow";
import { TaskDialog } from "./TaskDialog";
import { RotaDialog } from "./RotaDialog";

const KINDS = Object.keys(KIND_LABELS) as TaskKind[];

function useToggle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; done: boolean }) => setMyTaskDone(v.id, v.done),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

function MyTasks({ tasks, me }: { tasks: Task[]; me: string }) {
  const toggle = useToggle();
  const [show, setShow] = useState<"open" | "done" | "all">("open");
  const today = todayKey();
  const mine = tasks.filter((t) => myState(t, me, today) !== null);
  const list = mine
    .filter((t) => show === "all" || (show === "done" ? myState(t, me, today) === "done" : myState(t, me, today) !== "done"))
    .sort((a, b) => (show === "done" ? b.startsOn.localeCompare(a.startsOn) : a.startsOn.localeCompare(b.startsOn)) || (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
        {(["open", "done", "all"] as const).map((v) => (
          <button
            key={v} type="button" role="radio" aria-checked={show === v} onClick={() => setShow(v)}
            className={`min-h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${show === v ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}
          >{v === "open" ? "To do" : v === "done" ? "Done" : "Everything"}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="surface p-6 text-center text-sm text-muted-foreground">{show === "open" ? "Nothing for you to do. You are all caught up." : "Nothing here yet."}</p>
      ) : null}
      <ul className="grid gap-2">
        {list.map((t) => <li key={t.id}><TaskRow task={t} me={me} busy={toggle.isPending} onToggle={(done) => toggle.mutate({ id: t.id, done })} /></li>)}
      </ul>
    </div>
  );
}

function Everyones({ tasks, me, names, canAssign, canDownload, onEdit, onNew }: {
  tasks: Task[]; me: string; names: Map<string, string>; canAssign: boolean; canDownload: boolean; onEdit: (t: Task) => void; onNew: () => void;
}) {
  const toggle = useToggle();
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState<"open" | "overdue" | "done" | "all">("open");
  const [q, setQ] = useState("");
  const today = todayKey();
  const list = useMemo(() => tasks
    .filter((t) => (!person || t.people.some((p) => p.profileId === person)) && (!kind || t.kind === kind)
      && (status === "all" || taskState(t, today) === status) && (!q.trim() || t.title.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || (a.startsAt ?? "").localeCompare(b.startsAt ?? "")), [tasks, person, kind, status, q, today]);

  const people = [...names.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_10rem_9rem]">
        <Input aria-label="Search tasks" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Person" value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {people.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All kinds</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option><option value="overdue">Overdue</option><option value="done">Done</option><option value="all">All</option>
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs tabular-nums text-muted-foreground">{list.length} {list.length === 1 ? "task" : "tasks"}</p>
        <div className="flex gap-2">
          {canDownload ? (
            <DownloadMenu
              action="tasks.download" label="Download list" disabled={list.length === 0}
              getTable={() => ({
                title: "Tasks", filename: "tasks",
                subtitle: [person ? names.get(person) ?? "" : "Everyone", kind ? KIND_LABELS[kind as TaskKind] : "All kinds", status].filter(Boolean).join(" · "),
                columns: ["Date", "Time", "Task", "Kind", "Where", "People", "Done"],
                rows: list.map((t) => [
                  whenLabel({ ...t, startsAt: null, endsAt: null }), t.startsAt ? `${t.startsAt.slice(0, 5)}${t.endsAt ? " to " + t.endsAt.slice(0, 5) : ""}` : "", t.title, KIND_LABELS[t.kind], t.location ?? "",
                  t.people.map((p) => names.get(p.profileId) ?? "Someone").join(", "), `${t.people.filter((p) => p.status === "done").length} of ${t.people.length}`,
                ]),
              })}
            />
          ) : null}
          {canAssign ? <Button type="button" size="sm" onClick={onNew}><Plus className="size-4" aria-hidden /> New task</Button> : null}
        </div>
      </div>
      {list.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">No tasks match.</p> : null}
      <ul className="grid gap-2">
        {list.map((t) => (
          <li key={t.id}><TaskRow task={t} me={me} names={names} busy={toggle.isPending} onOpen={canAssign ? () => onEdit(t) : undefined} onToggle={(done) => toggle.mutate({ id: t.id, done })} /></li>
        ))}
      </ul>
    </div>
  );
}

function Rotas({ rotas, names, canAssign, onEdit, onNew }: { rotas: Rota[]; names: Map<string, string>; canAssign: boolean; onEdit: (r: Rota) => void; onNew: () => void }) {
  const day = ["", "Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">A rota is a duty that people take turns at, such as morning gate duty. It is laid out as ordinary tasks, one for each day.</p>
        {canAssign ? <Button type="button" size="sm" onClick={onNew}><Plus className="size-4" aria-hidden /> New rota</Button> : null}
      </div>
      {rotas.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">No rotas yet.</p> : null}
      <ul className="grid gap-3">
        {rotas.map((r) => (
          <li key={r.id} className="surface space-y-1 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-semibold">{r.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABELS[r.kind]} · {r.weekdays.map((d) => day[d]).join(", ")} · {r.rotation === "weekly" ? "a new person each week" : "a new person each day"}
                  {r.perSlot > 1 ? ` · ${r.perSlot} at a time` : ""} · {r.startsOn} to {r.endsOn}
                </p>
              </div>
              {canAssign ? <Button type="button" size="sm" variant="outline" onClick={() => onEdit(r)}>Change</Button> : null}
            </div>
            <p className="break-words text-xs text-muted-foreground">In turn: {r.people.map((id, i) => `${i + 1}. ${names.get(id) ?? "Someone"}`).join("  ")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Tasks() {
  const { profile } = useAuth();
  const { can } = useCapabilities();
  const me = profile?.id ?? "";
  const canAssign = can("tasks.assign");
  const canOversee = canAssign || can("tasks.view_all");
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: listTasks, staleTime: 15_000 });
  const staff = useQuery({ queryKey: ["assignable-staff"], queryFn: listAssignableStaff, enabled: canOversee, staleTime: 5 * 60_000, retry: false });
  const rotas = useQuery({ queryKey: ["task-rotas"], queryFn: listRotas, enabled: canOversee, retry: false });
  const names = useMemo(() => new Map((staff.data ?? []).map((s) => [s.id, s.name] as const)), [staff.data]);
  const [taskDialog, setTaskDialog] = useState<{ task: Task | null } | null>(null);
  const [rotaDialog, setRotaDialog] = useState<{ rota: Rota | null } | null>(null);

  const items = [
    { value: "mine", label: "My tasks" },
    ...(canOversee ? [{ value: "all", label: "Everyone's tasks" }, { value: "rotas", label: "Rotas" }] : []),
  ];

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><ListChecks className="size-6 text-primary" aria-hidden /> Tasks</h1>
        <p className="text-sm text-muted-foreground">Duties, invigilation and meetings, and who is doing them.</p>
      </div>
      {tasks.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {tasks.isError ? <p role="alert" className="surface p-4 text-sm">Tasks could not be loaded.</p> : null}
      {tasks.data && !canOversee ? <MyTasks tasks={tasks.data} me={me} /> : null}
      {tasks.data && canOversee ? (
        <SectionTabs items={items} defaultValue="mine" label="Tasks section" className="space-y-4">
          <TabsContent value="mine"><MyTasks tasks={tasks.data} me={me} /></TabsContent>
          {canOversee ? (
            <TabsContent value="all">
              <Everyones tasks={tasks.data} me={me} names={names} canAssign={canAssign} canDownload={can("tasks.download")} onEdit={(t) => setTaskDialog({ task: t })} onNew={() => setTaskDialog({ task: null })} />
            </TabsContent>
          ) : null}
          {canOversee ? (
            <TabsContent value="rotas">
              <Rotas rotas={rotas.data ?? []} names={names} canAssign={canAssign} onEdit={(r) => setRotaDialog({ rota: r })} onNew={() => setRotaDialog({ rota: null })} />
            </TabsContent>
          ) : null}
        </SectionTabs>
      ) : null}
      {canAssign ? (
        <>
          <TaskDialog open={taskDialog !== null} onClose={() => setTaskDialog(null)} task={taskDialog?.task ?? null} staff={staff.data ?? []} />
          <RotaDialog open={rotaDialog !== null} onClose={() => setRotaDialog(null)} rota={rotaDialog?.rota ?? null} staff={staff.data ?? []} />
        </>
      ) : null}
    </div>
  );
}
