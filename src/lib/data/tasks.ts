// Data layer for tasks and rotas. The database decides who sees what and who may assign; these calls read
// the tasks the signed-in person is allowed to see, tick off their own part, and (for those who assign)
// create tasks and rotas.
import { supabase } from "../supabase";
import type { TaskKind } from "../tasks";

export interface TaskPerson {
  profileId: string;
  status: "todo" | "done";
  doneAt: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  examPeriodId: string | null;
  rotaId: string | null;
  people: TaskPerson[];
}

interface Row {
  id: string; title: string; description: string | null; kind: string; starts_on: string; ends_on: string;
  starts_at: string | null; ends_at: string | null; location: string | null; exam_period_id: string | null; rota_id: string | null;
  task_assignees: { profile_id: string; status: string; done_at: string | null }[] | null;
}

const COLUMNS = "id, title, description, kind, starts_on, ends_on, starts_at, ends_at, location, exam_period_id, rota_id, task_assignees(profile_id, status, done_at)";

const toTask = (r: Row): Task => ({
  id: r.id, title: r.title, description: r.description, kind: r.kind as TaskKind, startsOn: r.starts_on, endsOn: r.ends_on,
  startsAt: r.starts_at, endsAt: r.ends_at, location: r.location, examPeriodId: r.exam_period_id, rotaId: r.rota_id,
  people: (r.task_assignees ?? []).map((a) => ({ profileId: a.profile_id, status: a.status as "todo" | "done", doneAt: a.done_at })),
});

/** The tasks the signed-in person may see: their own, or everyone's for someone who oversees tasks. */
export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase.from("tasks").select(COLUMNS).order("starts_on").order("starts_at", { nullsFirst: true }).limit(2000);
  if (error) throw error;
  return ((data ?? []) as unknown as Row[]).map(toTask);
}

export async function setMyTaskDone(taskId: string, done: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_my_task_status", { p_task: taskId, p_done: done });
  if (error) throw error;
}

export interface Staffer { id: string; name: string; job: string }

/** The staff who can be given a task, for those who assign (or oversee) tasks. */
export async function listAssignableStaff(): Promise<Staffer[]> {
  const { data, error } = await supabase.rpc("assignable_staff");
  if (error) throw error;
  return ((data ?? []) as { id: string; full_name: string; job: string }[]).map((r) => ({ id: r.id, name: r.full_name, job: r.job }));
}

export interface TaskInput {
  id?: string;
  title: string;
  description: string;
  kind: TaskKind;
  startsOn: string;
  endsOn: string;
  startsAt: string;
  endsAt: string;
  location: string;
  examPeriodId: string;
  people: string[];
}

export async function saveTask(i: TaskInput): Promise<string> {
  const { data, error } = await supabase.rpc("save_task", {
    p_id: i.id ?? null, p_title: i.title, p_description: i.description || null, p_kind: i.kind, p_starts_on: i.startsOn, p_ends_on: i.endsOn,
    p_starts_at: i.startsAt || null, p_ends_at: i.startsAt && i.endsAt ? i.endsAt : null, p_location: i.location || null,
    p_exam_period: i.examPeriodId || null, p_people: i.people,
  });
  if (error) throw error;
  return data as string;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

// ─── Rotas ───────────────────────────────────────────────────────────────────

export interface Rota {
  id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  weekdays: number[];
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  rotation: "daily" | "weekly";
  perSlot: number;
  startsOn: string;
  endsOn: string;
  people: string[];
}

export async function listRotas(): Promise<Rota[]> {
  const { data, error } = await supabase.from("task_rotas")
    .select("id, title, description, kind, weekdays, starts_at, ends_at, location, rotation, per_slot, starts_on, ends_on, people").order("starts_on", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, title: r.title, description: r.description, kind: r.kind as TaskKind, weekdays: (r.weekdays as number[]) ?? [],
    startsAt: r.starts_at, endsAt: r.ends_at, location: r.location, rotation: r.rotation as "daily" | "weekly", perSlot: r.per_slot,
    startsOn: r.starts_on, endsOn: r.ends_on, people: (r.people as string[]) ?? [],
  }));
}

export interface RotaInputData {
  id?: string;
  title: string;
  description: string;
  kind: TaskKind;
  weekdays: number[];
  startsAt: string;
  endsAt: string;
  location: string;
  rotation: "daily" | "weekly";
  perSlot: number;
  startsOn: string;
  endsOn: string;
  people: string[];
}

/** Saves the rota and lays its days out as tasks from today on. Returns how many tasks were made. */
export async function saveRotaAndGenerate(i: RotaInputData): Promise<number> {
  const saved = await supabase.rpc("save_task_rota", {
    p_id: i.id ?? null, p_title: i.title, p_description: i.description || null, p_kind: i.kind, p_weekdays: i.weekdays,
    p_starts_at: i.startsAt || null, p_ends_at: i.startsAt && i.endsAt ? i.endsAt : null, p_location: i.location || null,
    p_rotation: i.rotation, p_per_slot: i.perSlot, p_starts_on: i.startsOn, p_ends_on: i.endsOn, p_people: i.people,
  });
  if (saved.error) throw saved.error;
  const made = await supabase.rpc("generate_rota_tasks", { p_rota: saved.data as string });
  if (made.error) throw made.error;
  return Number(made.data ?? 0);
}

export async function deleteRota(id: string): Promise<void> {
  const { error } = await supabase.rpc("delete_task_rota", { p_id: id });
  if (error) throw error;
}
