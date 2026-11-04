// Unit tests for the calendar helpers (dates, ranges, the month grid, the list, the phone-calendar file).
// Run: node supabase/tests/calendar_unit.mjs   (Node 22.6+ strips the types)
import {
  addDays, daysBetween, eventsOnDay, formatRange, listText, monthGrid, monthsBetween, sortEvents, toIcs, weekday,
} from "../../src/lib/calendar.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};
const ev = (o) => ({ id: "id" + Math.random().toString(16).slice(2, 8), title: "T", description: null, kind: "event", startsOn: "2026-11-11", endsOn: "2026-11-11", startsAt: null, endsAt: null, audience: "all", published: true, ...o });

// dates
eq("add days across a month", addDays("2026-11-30", 1), "2026-12-01");
eq("add days across a year", addDays("2026-12-31", 1), "2027-01-01");
eq("leap day", addDays("2028-02-28", 1), "2028-02-29");
eq("subtract", addDays("2026-03-01", -1), "2026-02-28");
eq("days between", daysBetween("2026-11-04", "2026-11-14"), 10);
eq("4 Nov 2026 is a Wednesday", weekday("2026-11-04"), 2);
eq("a Monday is 0", weekday("2026-11-02"), 0);
eq("a Sunday is 6", weekday("2026-11-08"), 6);

// ranges
eq("one day", formatRange(ev({})), "Wed 11 Nov 2026");
eq("days in one month", formatRange(ev({ startsOn: "2026-11-11", endsOn: "2026-11-13" })), "11 to 13 Nov 2026");
eq("across months", formatRange(ev({ startsOn: "2026-11-30", endsOn: "2026-12-02" })), "30 Nov to 2 Dec 2026");
eq("across years", formatRange(ev({ startsOn: "2026-12-30", endsOn: "2027-01-02" })), "30 Dec 2026 to 2 Jan 2027");
eq("with a time", formatRange(ev({ startsAt: "09:00:00", endsAt: "10:30:00" })), "Wed 11 Nov 2026, 09:00 to 10:30");
eq("with only a start time", formatRange(ev({ startsAt: "14:00:00" })), "Wed 11 Nov 2026, 14:00");

// grid
const nov = monthGrid(2026, 10);
eq("november 2026 starts on a Sunday, so it spans six weeks", nov.length, 6);
eq("every week has seven days", nov.every((w) => w.length === 7), true);
eq("the first cell is Monday 26 Oct", nov[0][0].key, "2026-10-26");
eq("and is outside the month", nov[0][0].inMonth, false);
eq("1 Nov 2026 is a Sunday, so the last cell of week one", nov[0][6].key, "2026-11-01");
eq("30 Nov is the first cell of the last week", nov[5][0].key, "2026-11-30");
eq("february 2027 has four weeks", monthGrid(2027, 1).length, 4);
eq("months in a term", monthsBetween("2026-09-07", "2026-12-18").map((m) => m.month), [8, 9, 10, 11]);
eq("months across a year end", monthsBetween("2026-11-01", "2027-02-01").map((m) => `${m.year}-${m.month + 1}`), ["2026-11", "2026-12", "2027-1", "2027-2"]);

// which events fall on a day
const evs = [ev({ title: "A", startsOn: "2026-11-10", endsOn: "2026-11-12" }), ev({ title: "B", startsOn: "2026-11-12", endsOn: "2026-11-12" })];
eq("a multi-day event is on every day", eventsOnDay(evs, "2026-11-11").map((e) => e.title), ["A"]);
eq("two events on one day", eventsOnDay(evs, "2026-11-12").map((e) => e.title), ["A", "B"]);
eq("none on a free day", eventsOnDay(evs, "2026-11-13").length, 0);
eq("sorted by date then time then title", sortEvents([ev({ title: "Z", startsOn: "2026-11-02" }), ev({ title: "B", startsOn: "2026-11-01", startsAt: "10:00" }), ev({ title: "A", startsOn: "2026-11-01", startsAt: "09:00" })]).map((e) => e.title), ["A", "B", "Z"]);

// the list
const list = [
  ev({ title: "Mid-term break", kind: "holiday", startsOn: "2026-10-29", endsOn: "2026-10-30" }),
  ev({ title: "Open day", startsOn: "2026-11-11" }),
  ev({ title: "BECE mock", kind: "exam", startsOn: "2026-11-23", endsOn: "2026-11-27" }),
];
const bullets = listText("Term 1 calendar", "Pinks Academy", list, "bullets");
eq("bulleted list", bullets, "Term 1 calendar\r\nPinks Academy\r\n\r\nOCTOBER 2026\r\n• 29 to 30 Oct 2026: Mid-term break (Holiday)\r\n\r\nNOVEMBER 2026\r\n• Wed 11 Nov 2026: Open day\r\n• 23 to 27 Nov 2026: BECE mock (Exam)\r\n");
const numbers = listText("T", "", list, "numbers");
eq("numbered list keeps counting across months", numbers.includes("3. 23 to 27 Nov 2026: BECE mock (Exam)"), true);
eq("an empty list says so", listText("T", "", [], "bullets").includes("No events."), true);

// the phone calendar file
const ics = toIcs([ev({ id: "abc", title: "Sports, day; fun", description: "Bring water\nand a hat", startsOn: "2026-11-11", endsOn: "2026-11-12" }), ev({ id: "def", title: "PTA", startsAt: "17:30:00", endsAt: "19:00:00" })], "Pinks Academy", new Date("2026-11-04T08:00:00Z"));
eq("starts and ends the calendar", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"), true);
eq("all-day events end the next day", ics.includes("DTSTART;VALUE=DATE:20261111\r\nDTEND;VALUE=DATE:20261113"), true);
eq("timed events carry the time", ics.includes("DTSTART:20261111T173000\r\nDTEND:20261111T190000"), true);
eq("commas and semicolons are escaped", ics.includes("SUMMARY:Sports\\, day\\; fun"), true);
eq("line breaks in a description are escaped", ics.includes("DESCRIPTION:Bring water\\nand a hat"), true);
eq("the stamp is in UTC", ics.includes("DTSTAMP:20261104T080000Z"), true);
eq("every line ends with CRLF", /[^\r]\n/.test(ics), false);
const longTitle = toIcs([ev({ title: "x".repeat(200) })], "S");
eq("long lines are folded to 75 bytes", longTitle.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75), true);
const injected = toIcs([ev({ title: "Hi\r\nEND:VEVENT\r\nBEGIN:VEVENT" })], "S");
eq("a title cannot add lines to the file", injected.split("\r\n").filter((l) => l === "BEGIN:VEVENT").length, 1);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
