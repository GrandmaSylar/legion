// Unit tests for the exam timetable helpers. Run: node supabase/tests/exam_unit.mjs
import { byDay, clashWith, dayText, durationText, hm, minutes, timeRange } from "../../src/lib/examTimetable.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};
const p = (examDate, startsAt, endsAt, classLabel, subjectName, id) => ({ id, examDate, startsAt, endsAt, classLabel, subjectName });

eq("hours and minutes only", hm("09:00:00"), "09:00");
eq("a range", timeRange({ startsAt: "09:00:00", endsAt: "10:30:00" }), "09:00 to 10:30");
eq("minutes in a day", minutes("10:30:00"), 630);
eq("an hour and a half", durationText({ startsAt: "09:00", endsAt: "10:30" }), "1 h 30 min");
eq("two hours", durationText({ startsAt: "09:00", endsAt: "11:00" }), "2 h");
eq("forty-five minutes", durationText({ startsAt: "09:00", endsAt: "09:45" }), "45 min");
eq("a backwards paper has no length", durationText({ startsAt: "10:00", endsAt: "09:00" }), "");
eq("a day", dayText("2026-11-09"), "Mon 9 Nov");

const list = [p("2026-11-10", "09:00", "10:00", "Basic 4A", "Maths"), p("2026-11-09", "11:00", "12:00", "Basic 4B", "English"),
  p("2026-11-09", "09:00", "10:00", "Basic 4B", "Maths"), p("2026-11-09", "09:00", "10:00", "Basic 10A", "Maths")];
const g = byDay(list);
eq("days in order", g.map(([d]) => d), ["2026-11-09", "2026-11-10"]);
eq("papers in a day by time, then class (numbers sorted as numbers)", g[0][1].map((x) => `${x.startsAt} ${x.classLabel}`), ["09:00 Basic 4B", "09:00 Basic 10A", "11:00 Basic 4B"]);
eq("nothing in, nothing out", byDay([]), []);

const others = [p("2026-11-09", "09:00", "10:30", "Basic 4A", "Maths", "x")];
eq("an overlap is found", clashWith(others, { classLabel: "Basic 4A", examDate: "2026-11-09", startsAt: "10:00", endsAt: "11:00" })?.subjectName, "Maths");
eq("a paper starting as the other ends does not clash", clashWith(others, { classLabel: "Basic 4A", examDate: "2026-11-09", startsAt: "10:30", endsAt: "11:30" }), null);
eq("another class does not clash", clashWith(others, { classLabel: "Basic 4B", examDate: "2026-11-09", startsAt: "09:00", endsAt: "10:30" }), null);
eq("another day does not clash", clashWith(others, { classLabel: "Basic 4A", examDate: "2026-11-10", startsAt: "09:00", endsAt: "10:30" }), null);
eq("a paper does not clash with itself", clashWith(others, { id: "x", classLabel: "Basic 4A", examDate: "2026-11-09", startsAt: "09:15", endsAt: "10:00" }), null);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
