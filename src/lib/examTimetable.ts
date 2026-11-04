// Plain helpers for the exam timetable: grouping papers by day, writing times, and spotting clashes before the
// database does. No imports, so it can be tested on its own. The database makes the real decision on every rule.

export interface PaperLike { examDate: string; startsAt: string; endsAt: string; classLabel: string; subjectName: string }

/** "09:00" from "09:00:00". */
export const hm = (t: string) => t.slice(0, 5);

export const timeRange = (p: Pick<PaperLike, "startsAt" | "endsAt">) => `${hm(p.startsAt)} to ${hm(p.endsAt)}`;

/** Minutes from "HH:MM" or "HH:MM:SS". */
export const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export const durationText = (p: Pick<PaperLike, "startsAt" | "endsAt">) => {
  const m = minutes(p.endsAt) - minutes(p.startsAt);
  if (m <= 0) return "";
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
};

/** Papers grouped by day, days in order, and each day's papers in time order. */
export function byDay<T extends PaperLike>(papers: T[]): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const p of papers) m.set(p.examDate, [...(m.get(p.examDate) ?? []), p]);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, list]) => [d, [...list].sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.classLabel.localeCompare(b.classLabel, undefined, { numeric: true }))]);
}

/** Does a paper at these times overlap another for the same class that day? (The database refuses it; this lets the form say so first.) */
export function clashWith<T extends PaperLike & { id?: string }>(others: T[], candidate: { id?: string; classLabel: string; examDate: string; startsAt: string; endsAt: string }): T | null {
  return others.find((o) => o.id !== candidate.id && o.classLabel === candidate.classLabel && o.examDate === candidate.examDate
    && minutes(o.startsAt) < minutes(candidate.endsAt) && minutes(o.endsAt) > minutes(candidate.startsAt)) ?? null;
}

/** A day inside the period, the way people say it: "Mon 9 Nov". */
export function dayText(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
