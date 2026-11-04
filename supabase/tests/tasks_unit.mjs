// Unit tests for the task helpers: the rota preview (which must match the database's rule exactly), and task state.
// Run: node supabase/tests/tasks_unit.mjs   (Node 22.6+ strips the types)
import { addDays, isoWeekday, myState, rotaPlan, taskState, whenLabel } from "../../src/lib/tasks.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};

eq("1 March 2027 is a Monday", isoWeekday("2027-03-01"), 1);
eq("a Sunday is 7", isoWeekday("2027-03-07"), 7);
eq("add days across a month", addDays("2027-02-27", 3), "2027-03-02");

// The same cases the database tests check: Monday 1 March 2027
const M0 = "2027-03-01";

// Weekly over three weeks, one person a week, Monday to Friday
const weekly = rotaPlan({ weekdays: [1, 2, 3, 4, 5], rotation: "weekly", perSlot: 1, startsOn: M0, endsOn: addDays(M0, 18), people: ["T", "R", "A"] });
eq("fifteen days", weekly.length, 15);
eq("week one is the first person every day", weekly.slice(0, 5).map((d) => d.people[0]), ["T", "T", "T", "T", "T"]);
eq("week two is the second", weekly.slice(5, 10).map((d) => d.people[0]), ["R", "R", "R", "R", "R"]);
eq("week three is the third", weekly.slice(10).map((d) => d.people[0]), ["A", "A", "A", "A", "A"]);
eq("no weekends", weekly.every((d) => isoWeekday(d.date) <= 5), true);

// Daily, Monday and Wednesday, two people a day from three
const daily = rotaPlan({ weekdays: [1, 3], rotation: "daily", perSlot: 2, startsOn: M0, endsOn: addDays(M0, 11), people: ["T", "R", "A"] });
eq("four days", daily.map((d) => d.date), [M0, addDays(M0, 2), addDays(M0, 7), addDays(M0, 9)]);
eq("day one is the first two", daily[0].people, ["T", "R"]);
eq("day two takes the third and wraps to the first", daily[1].people, ["A", "T"]);
eq("day three is the second and third", daily[2].people, ["R", "A"]);
eq("day four wraps round again", daily[3].people, ["T", "R"]);

// A single person always gets every day
eq("one person", rotaPlan({ weekdays: [1, 2, 3, 4, 5], rotation: "daily", perSlot: 1, startsOn: M0, endsOn: addDays(M0, 4), people: ["T"] }).map((d) => d.people[0]), ["T", "T", "T", "T", "T"]);
// A week that starts mid-week still counts as one week
eq("a rota that starts on a Wednesday: Wed-Fri then the next week", rotaPlan({ weekdays: [1, 2, 3, 4, 5], rotation: "weekly", perSlot: 1, startsOn: addDays(M0, 2), endsOn: addDays(M0, 8), people: ["T", "R"] }).map((d) => d.people[0]), ["T", "T", "T", "R", "R"]);
// Bad input gives nothing
eq("nobody in the rota", rotaPlan({ weekdays: [1], rotation: "daily", perSlot: 1, startsOn: M0, endsOn: addDays(M0, 7), people: [] }), []);
eq("more a day than people", rotaPlan({ weekdays: [1], rotation: "daily", perSlot: 3, startsOn: M0, endsOn: addDays(M0, 7), people: ["T"] }), []);
eq("ends before it starts", rotaPlan({ weekdays: [1], rotation: "daily", perSlot: 1, startsOn: addDays(M0, 7), endsOn: M0, people: ["T"] }), []);

// State
const t = (endsOn, ...statuses) => ({ startsOn: endsOn, endsOn, people: statuses.map((s, i) => ({ profileId: "p" + i, status: s })) });
eq("everyone done", taskState(t("2027-03-01", "done", "done"), "2027-03-05"), "done");
eq("someone not done and the day has passed", taskState(t("2027-03-01", "done", "todo"), "2027-03-05"), "overdue");
eq("not done and not yet due", taskState(t("2027-03-09", "todo"), "2027-03-05"), "open");
eq("due today is still open", taskState(t("2027-03-05", "todo"), "2027-03-05"), "open");
eq("a task with nobody is not done", taskState(t("2027-03-09"), "2027-03-05"), "open");
eq("my own part done", myState(t("2027-03-01", "done", "todo"), "p0", "2027-03-05"), "done");
eq("my own part overdue", myState(t("2027-03-01", "done", "todo"), "p1", "2027-03-05"), "overdue");
eq("not mine", myState(t("2027-03-01", "done"), "zzz", "2027-03-05"), null);

eq("a one-day label", whenLabel({ startsOn: "2027-03-01", endsOn: "2027-03-01", startsAt: "07:30:00", endsAt: "08:00:00" }), "Mon 1 Mar, 07:30 to 08:00");
eq("a run of days", whenLabel({ startsOn: "2027-03-01", endsOn: "2027-03-03", startsAt: null, endsAt: null }), "Mon 1 Mar to Wed 3 Mar");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
