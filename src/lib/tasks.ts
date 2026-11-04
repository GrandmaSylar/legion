// Pure helpers for tasks and rotas: who a rota will put on each day (a preview that follows the database's
// rule exactly), and whether a task is open, done or overdue. Dates are plain "YYYY-MM-DD" text.

export type TaskKind = "duty" | "invigilation" | "meeting" | "other";

export const KIND_LABELS: Record<TaskKind, string> = {
  duty: "Duty", invigilation: "Invigilation", meeting: "Meeting", other: "Other",
};

const serial = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
};
const fromSerial = (n: number) => new Date(n * 86400000).toISOString().slice(0, 10);

/** 1 = Monday … 7 = Sunday. */
export const isoWeekday = (key: string) => ((new Date(serial(key) * 86400000).getUTCDay() + 6) % 7) + 1;
export const addDays = (key: string, n: number) => fromSerial(serial(key) + n);
const mondayOf = (key: string) => addDays(key, -(isoWeekday(key) - 1));

export interface RotaInput {
  weekdays: number[];
  rotation: "daily" | "weekly";
  perSlot: number;
  startsOn: string;
  endsOn: string;
  /** In turn. The first person takes the first turn. */
  people: string[];
}

export interface RotaDay { date: string; people: string[] }

/**
 * Every day the rota covers and who is on it. People take turns in order: daily moves to the next person (or
 * group of people) each covered day, weekly each week. Turns are counted from the rota's first day, so the
 * answer for a given day never depends on what has already been made.
 */
export function rotaPlan(r: RotaInput): RotaDay[] {
  const n = r.people.length;
  const out: RotaDay[] = [];
  if (n === 0 || r.perSlot < 1 || r.perSlot > n || r.endsOn < r.startsOn) return out;
  let slot = 0;
  let weekIdx = -1;
  let lastWeek = "";
  for (let d = r.startsOn; d <= r.endsOn; d = addDays(d, 1)) {
    if (!r.weekdays.includes(isoWeekday(d))) continue;
    if (r.rotation === "weekly") {
      const wk = mondayOf(d);
      if (wk !== lastWeek) { weekIdx++; lastWeek = wk; }
      slot = weekIdx;
    }
    out.push({ date: d, people: Array.from({ length: r.perSlot }, (_, k) => r.people[(slot * r.perSlot + k) % n]) });
    if (r.rotation === "daily") slot++;
  }
  return out;
}

export interface TaskLike {
  startsOn: string;
  endsOn: string;
  people: { profileId: string; status: "todo" | "done" }[];
}

export type TaskState = "done" | "overdue" | "open";

/** Done when everyone has ticked it off; overdue when it has finished and someone has not. */
export function taskState(t: TaskLike, today: string): TaskState {
  if (t.people.length > 0 && t.people.every((p) => p.status === "done")) return "done";
  return t.endsOn < today ? "overdue" : "open";
}

/** The same question about one person's own part. */
export function myState(t: TaskLike, me: string, today: string): TaskState | null {
  const mine = t.people.find((p) => p.profileId === me);
  if (!mine) return null;
  if (mine.status === "done") return "done";
  return t.endsOn < today ? "overdue" : "open";
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayLabel = (k: string) => `${DAY_NAMES[isoWeekday(k) - 1]} ${Number(k.slice(8, 10))} ${MONTH_NAMES[Number(k.slice(5, 7)) - 1]}`;

/** "Mon 8 Mar", "Mon 8 Mar to Wed 10 Mar", with the time when there is one. */
export function whenLabel(t: { startsOn: string; endsOn: string; startsAt: string | null; endsAt: string | null }): string {
  let text = t.startsOn === t.endsOn ? dayLabel(t.startsOn) : `${dayLabel(t.startsOn)} to ${dayLabel(t.endsOn)}`;
  if (t.startsAt) text += `, ${t.startsAt.slice(0, 5)}${t.endsAt ? ` to ${t.endsAt.slice(0, 5)}` : ""}`;
  return text;
}
