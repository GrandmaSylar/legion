// Unit tests for the school-day helpers (laying a day out from lessons and breaks, describing it, checking it).
// Run: node supabase/tests/bell_unit.mjs   (Node 22.6+ strips the types)
import { buildDay, dayProblem, describeDay, fromMinutes, toMinutes } from "../../src/lib/bell.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};

eq("minutes from a time", toMinutes("08:30"), 510);
eq("a time from minutes", fromMinutes(510), "08:30");
eq("midnight padding", fromMinutes(5), "00:05");

// Eight 40-minute lessons from 08:00, a 20-minute break after the second and a 40-minute lunch after the fifth.
const day = buildDay({ start: "08:00", lessonMinutes: 40, lessons: 8, breaks: [{ afterLesson: 2, minutes: 20, label: "Snack break" }, { afterLesson: 5, minutes: 40, label: "Lunch" }] });
eq("no error", day.error, null);
eq("ten periods", day.periods.length, 10);
eq("first lesson", day.periods[0], { label: "Lesson 1", kind: "lesson", start: "08:00", end: "08:40" });
eq("second lesson", day.periods[1], { label: "Lesson 2", kind: "lesson", start: "08:40", end: "09:20" });
eq("the break follows the second lesson", day.periods[2], { label: "Snack break", kind: "break", start: "09:20", end: "09:40" });
eq("the third lesson starts after the break", day.periods[3], { label: "Lesson 3", kind: "lesson", start: "09:40", end: "10:20" });
eq("the lunch follows the fifth lesson", day.periods[6], { label: "Lunch", kind: "break", start: "11:40", end: "12:20" });
eq("the last lesson ends at 14:20", day.periods[9], { label: "Lesson 8", kind: "lesson", start: "13:40", end: "14:20" });
eq("it is described in a line", describeDay(day.periods), "8 lessons, 2 breaks, 08:00 to 14:20");
eq("and passes the checks", dayProblem(day.periods), null);

// A different school: five 60-minute lessons, no breaks.
const plain = buildDay({ start: "08:30", lessonMinutes: 60, lessons: 5, breaks: [] });
eq("five hour-long lessons end at 13:30", [plain.periods[0].start, plain.periods[4].end], ["08:30", "13:30"]);
eq("described without breaks", describeDay(plain.periods), "5 lessons, 08:30 to 13:30");
eq("one lesson is singular", describeDay(buildDay({ start: "09:00", lessonMinutes: 30, lessons: 1, breaks: [] }).periods), "1 lesson, 09:00 to 09:30");

// Awkward input
eq("two breaks after the same lesson run one after the other",
  buildDay({ start: "08:00", lessonMinutes: 30, lessons: 2, breaks: [{ afterLesson: 1, minutes: 10, label: "Tea" }, { afterLesson: 1, minutes: 20, label: "Play" }] }).periods.map((p) => `${p.start}-${p.end}`),
  ["08:00-08:30", "08:30-08:40", "08:40-09:00", "09:00-09:30"]);
eq("a zero-minute break is ignored", buildDay({ start: "08:00", lessonMinutes: 30, lessons: 2, breaks: [{ afterLesson: 1, minutes: 0, label: "None" }] }).periods.length, 2);
eq("a blank break name becomes Break", buildDay({ start: "08:00", lessonMinutes: 30, lessons: 2, breaks: [{ afterLesson: 1, minutes: 10, label: "  " }] }).periods[1].label, "Break");
eq("a break after a lesson that does not exist is ignored", buildDay({ start: "08:00", lessonMinutes: 30, lessons: 2, breaks: [{ afterLesson: 9, minutes: 10, label: "x" }] }).periods.length, 2);
eq("a day cannot run past midnight", buildDay({ start: "20:00", lessonMinutes: 120, lessons: 5, breaks: [] }).error, "That day would run past midnight. Shorten the lessons or breaks.");
eq("no lessons is refused", buildDay({ start: "08:00", lessonMinutes: 40, lessons: 0, breaks: [] }).error, "Choose between 1 and 15 lessons.");
eq("a very short lesson is refused", buildDay({ start: "08:00", lessonMinutes: 2, lessons: 3, breaks: [] }).error, "A lesson lasts between 5 and 180 minutes.");
eq("a missing start is refused", buildDay({ start: "", lessonMinutes: 40, lessons: 3, breaks: [] }).error, "Choose when the day starts.");
eq("too many periods is refused", buildDay({ start: "06:00", lessonMinutes: 20, lessons: 15, breaks: Array.from({ length: 15 }, (_, i) => ({ afterLesson: i + 1, minutes: 1, label: "b" })) }).error, "A day can have at most 20 periods and breaks.");

// The same checks the database makes
eq("an empty day", dayProblem([]), "Add at least one lesson.");
eq("a day of breaks only", dayProblem([{ label: "Break", kind: "break", start: "09:00", end: "09:20" }]), "A school day needs at least one lesson.");
eq("a period that ends before it starts", dayProblem([{ label: "Lesson 1", kind: "lesson", start: "09:00", end: "08:00" }]), "\"Lesson 1\" must end after it starts.");
eq("overlapping periods", dayProblem([{ label: "Lesson 1", kind: "lesson", start: "08:00", end: "08:40" }, { label: "Lesson 2", kind: "lesson", start: "08:30", end: "09:10" }]), "\"Lesson 2\" starts before \"Lesson 1\" has finished.");
eq("a nameless period", dayProblem([{ label: " ", kind: "lesson", start: "08:00", end: "08:40" }]), "Every period needs a name.");
eq("periods may touch", dayProblem([{ label: "A", kind: "lesson", start: "08:00", end: "08:40" }, { label: "B", kind: "lesson", start: "08:40", end: "09:20" }]), null);
eq("order does not matter", dayProblem([{ label: "B", kind: "lesson", start: "08:40", end: "09:20" }, { label: "A", kind: "lesson", start: "08:00", end: "08:40" }]), null);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
