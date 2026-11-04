// Pure helpers for the school day: turning "eight 40-minute lessons from 08:00, with a break after the
// second and the fifth" into periods with real times, and describing a day in a line. Times are plain
// "HH:MM" text so a time zone can never move them.

export type PeriodKind = "lesson" | "break";

export interface DayPeriod {
  label: string;
  kind: PeriodKind;
  start: string;
  end: string;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface BreakInput {
  /** The break comes after this lesson (1 is after the first lesson). */
  afterLesson: number;
  minutes: number;
  label: string;
}

export interface DayInput {
  start: string;
  lessonMinutes: number;
  lessons: number;
  breaks: BreakInput[];
}

export interface BuiltDay {
  periods: DayPeriod[];
  /** Set when the day cannot be laid out, for example it would run past midnight. */
  error: string | null;
}

/** Lay out a day: lessons one after another, each break after the lesson it is set to follow. */
export function buildDay(input: DayInput): BuiltDay {
  const { start, lessonMinutes, lessons } = input;
  if (!/^\d{2}:\d{2}$/.test(start)) return { periods: [], error: "Choose when the day starts." };
  if (!Number.isInteger(lessons) || lessons < 1 || lessons > 15) return { periods: [], error: "Choose between 1 and 15 lessons." };
  if (!Number.isInteger(lessonMinutes) || lessonMinutes < 5 || lessonMinutes > 180) return { periods: [], error: "A lesson lasts between 5 and 180 minutes." };

  const periods: DayPeriod[] = [];
  let cursor = toMinutes(start);
  for (let i = 1; i <= lessons; i++) {
    periods.push({ label: `Lesson ${i}`, kind: "lesson", start: fromMinutes(cursor), end: fromMinutes(cursor + lessonMinutes) });
    cursor += lessonMinutes;
    for (const b of input.breaks.filter((x) => x.afterLesson === i)) {
      const mins = Math.max(0, Math.round(b.minutes));
      if (mins === 0) continue;
      periods.push({ label: b.label.trim() || "Break", kind: "break", start: fromMinutes(cursor), end: fromMinutes(cursor + mins) });
      cursor += mins;
    }
  }
  if (cursor > 23 * 60 + 59) return { periods: [], error: "That day would run past midnight. Shorten the lessons or breaks." };
  if (periods.length > 20) return { periods: [], error: "A day can have at most 20 periods and breaks." };
  return { periods, error: null };
}

/** "8 lessons, 2 breaks, 08:00 to 14:20" */
export function describeDay(periods: Pick<DayPeriod, "kind" | "start" | "end">[]): string {
  if (periods.length === 0) return "No periods";
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start));
  const lessons = periods.filter((p) => p.kind === "lesson").length;
  const breaks = periods.length - lessons;
  const parts = [`${lessons} ${lessons === 1 ? "lesson" : "lessons"}`];
  if (breaks > 0) parts.push(`${breaks} ${breaks === 1 ? "break" : "breaks"}`);
  parts.push(`${sorted[0].start.slice(0, 5)} to ${sorted[sorted.length - 1].end.slice(0, 5)}`);
  return parts.join(", ");
}

/** What is wrong with a day, in words, or null when it is fine. Mirrors the database's checks. */
export function dayProblem(periods: DayPeriod[]): string | null {
  if (periods.length === 0) return "Add at least one lesson.";
  if (periods.length > 20) return "A day can have at most 20 periods and breaks.";
  if (!periods.some((p) => p.kind === "lesson")) return "A school day needs at least one lesson.";
  const sorted = [...periods].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    if (!p.label.trim()) return "Every period needs a name.";
    if (!p.start || !p.end) return `Choose the times for "${p.label || "a period"}".`;
    if (p.start >= p.end) return `"${p.label}" must end after it starts.`;
    if (i > 0 && p.start < sorted[i - 1].end) return `"${p.label}" starts before "${sorted[i - 1].label}" has finished.`;
  }
  return null;
}
