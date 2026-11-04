// Pure helpers for the term calendar: dates, ranges, the month grid, the list a person can download,
// and the file a phone calendar can open. Dates are plain "YYYY-MM-DD" text throughout, so a time zone
// can never move an event to the wrong day.

export type EventKind = "event" | "holiday" | "exam" | "meeting" | "deadline" | "trip";
export type EventAudience = "all" | "staff" | "parents";

export interface CalEvent {
  id: string;
  title: string;
  description: string | null;
  kind: EventKind;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  endsAt: string | null;
  audience: EventAudience;
  published: boolean;
}

export const KIND_LABELS: Record<EventKind, string> = {
  event: "Event", holiday: "Holiday", exam: "Exam", meeting: "Meeting", deadline: "Deadline", trip: "Trip",
};
export const AUDIENCE_LABELS: Record<EventAudience, string> = {
  all: "Everyone", staff: "Staff only", parents: "Parents and staff",
};

/** Colours for the picture. The screen uses the same idea through its own classes. */
export const KIND_COLORS: Record<EventKind, { bg: string; fg: string }> = {
  event: { bg: "#dbeafe", fg: "#1e3a8a" },
  holiday: { bg: "#dcfce7", fg: "#14532d" },
  exam: { bg: "#fee2e2", fg: "#7f1d1d" },
  meeting: { bg: "#ede9fe", fg: "#4c1d95" },
  deadline: { bg: "#ffedd5", fg: "#7c2d12" },
  trip: { bg: "#cffafe", fg: "#164e63" },
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_NAMES = MONTHS;
export const WEEKDAY_NAMES = DAYS;

const pad = (n: number) => String(n).padStart(2, "0");

export function parseKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y, m: m - 1, d };
}
export const toKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function serial(key: string): number {
  const { y, m, d } = parseKey(key);
  return Math.round(Date.UTC(y, m, d) / 86400000);
}
function fromSerial(n: number): string {
  const dt = new Date(n * 86400000);
  return toKey(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}
export const addDays = (key: string, n: number) => fromSerial(serial(key) + n);
export const daysBetween = (a: string, b: string) => serial(b) - serial(a);

/** 0 = Monday … 6 = Sunday. */
export function weekday(key: string): number {
  return (new Date(serial(key) * 86400000).getUTCDay() + 6) % 7;
}

export function dayLabel(key: string, withWeekday = false): string {
  const { y, m, d } = parseKey(key);
  return `${withWeekday ? DAYS[weekday(key)] + " " : ""}${d} ${MONTHS[m].slice(0, 3)} ${y}`;
}

const hhmm = (t: string) => t.slice(0, 5);

/** "11 Nov 2026", "11 to 13 Nov 2026" or "30 Nov to 2 Dec 2026", with the time when there is one. */
export function formatRange(e: Pick<CalEvent, "startsOn" | "endsOn" | "startsAt" | "endsAt">): string {
  const a = parseKey(e.startsOn);
  const b = parseKey(e.endsOn);
  let text: string;
  if (e.startsOn === e.endsOn) text = dayLabel(e.startsOn, true);
  else if (a.y === b.y && a.m === b.m) text = `${a.d} to ${b.d} ${MONTHS[a.m].slice(0, 3)} ${a.y}`;
  else if (a.y === b.y) text = `${a.d} ${MONTHS[a.m].slice(0, 3)} to ${b.d} ${MONTHS[b.m].slice(0, 3)} ${a.y}`;
  else text = `${dayLabel(e.startsOn)} to ${dayLabel(e.endsOn)}`;
  if (e.startsAt) text += `, ${hhmm(e.startsAt)}${e.endsAt ? ` to ${hhmm(e.endsAt)}` : ""}`;
  return text;
}

export function sortEvents<T extends Pick<CalEvent, "startsOn" | "endsOn" | "startsAt" | "title">>(events: T[]): T[] {
  return [...events].sort((x, y) =>
    x.startsOn.localeCompare(y.startsOn) || (x.startsAt ?? "").localeCompare(y.startsAt ?? "") || x.title.localeCompare(y.title));
}

export const eventsOnDay = (events: CalEvent[], key: string) => events.filter((e) => e.startsOn <= key && e.endsOn >= key);

export const overlaps = (e: Pick<CalEvent, "startsOn" | "endsOn">, from: string, to: string) => e.startsOn <= to && e.endsOn >= from;

export interface MonthRef { year: number; month: number }

export function monthsBetween(from: string, to: string): MonthRef[] {
  const a = parseKey(from);
  const b = parseKey(to);
  const out: MonthRef[] = [];
  for (let y = a.y, m = a.m; y < b.y || (y === b.y && m <= b.m); m++) {
    if (m > 11) { m = 0; y++; }
    out.push({ year: y, month: m });
    if (out.length > 36) break;
  }
  return out;
}

export interface GridDay { key: string; day: number; inMonth: boolean }

/** Weeks of seven days, Monday first, padded with the neighbouring months' days. */
export function monthGrid(year: number, month: number): GridDay[][] {
  const first = toKey(year, month, 1);
  const lead = weekday(first);
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks: GridDay[][] = [];
  let cursor = addDays(first, -lead);
  const total = Math.ceil((lead + count) / 7) * 7;
  for (let i = 0; i < total; i++) {
    const p = parseKey(cursor);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ key: cursor, day: p.d, inMonth: p.m === month && p.y === year });
    cursor = addDays(cursor, 1);
  }
  return weeks;
}

// ─── The downloadable list ───────────────────────────────────────────────────

export type ListStyle = "bullets" | "numbers";

/** The list a person asks for: events in date order, grouped by month, bulleted or numbered. */
export function listLines(events: CalEvent[], style: ListStyle): { heading: string | null; text: string }[] {
  const lines: { heading: string | null; text: string }[] = [];
  let n = 0;
  let lastMonth = "";
  for (const e of sortEvents(events)) {
    const p = parseKey(e.startsOn);
    const month = `${MONTHS[p.m]} ${p.y}`;
    const heading = month !== lastMonth ? month : null;
    lastMonth = month;
    n++;
    const mark = style === "numbers" ? `${n}.` : "•";
    const kind = e.kind === "event" ? "" : ` (${KIND_LABELS[e.kind]})`;
    lines.push({ heading, text: `${mark} ${formatRange(e)}: ${e.title}${kind}` });
  }
  return lines;
}

export function listText(title: string, subtitle: string, events: CalEvent[], style: ListStyle): string {
  const out = [title];
  if (subtitle) out.push(subtitle);
  out.push("");
  const lines = listLines(events, style);
  if (lines.length === 0) out.push("No events.");
  for (const l of lines) {
    if (l.heading) { if (out[out.length - 1] !== "") out.push(""); out.push(l.heading.toUpperCase()); }
    out.push(l.text);
  }
  return out.join("\r\n") + "\r\n";
}

// ─── A file a phone's calendar app can open (iCalendar) ──────────────────────

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length === 0 ? 75 : 74)) { parts.push(cur); cur = ch; } else cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compact = (key: string) => key.replace(/-/g, "");

export function toIcs(events: CalEvent[], calendarName: string, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PhiNova//Legion School Calendar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${icsEscape(calendarName)}`];
  for (const e of sortEvents(events)) {
    out.push("BEGIN:VEVENT", `UID:${e.id}@legion.phinova`, `DTSTAMP:${stamp}`);
    if (e.startsAt) {
      out.push(`DTSTART:${compact(e.startsOn)}T${e.startsAt.slice(0, 5).replace(":", "")}00`);
      const endAt = e.endsAt ?? e.startsAt;
      out.push(`DTEND:${compact(e.endsOn)}T${endAt.slice(0, 5).replace(":", "")}00`);
    } else {
      out.push(`DTSTART;VALUE=DATE:${compact(e.startsOn)}`, `DTEND;VALUE=DATE:${compact(addDays(e.endsOn, 1))}`);
    }
    out.push(`SUMMARY:${icsEscape(e.title)}`);
    const desc = [e.kind === "event" ? "" : KIND_LABELS[e.kind], e.description ?? ""].filter(Boolean).join(". ");
    if (desc) out.push(`DESCRIPTION:${icsEscape(desc)}`);
    out.push(`CATEGORIES:${KIND_LABELS[e.kind].toUpperCase()}`, "END:VEVENT");
  }
  out.push("END:VCALENDAR");
  return out.map(fold).join("\r\n") + "\r\n";
}
