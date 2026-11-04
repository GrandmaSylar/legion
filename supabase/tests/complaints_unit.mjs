// Unit tests for the complaint words. Run: node supabase/tests/complaints_unit.mjs
import { ANONYMOUS_PROMISE, CATEGORIES, HANDLER_STATUS_LABELS, STATUS_LABELS, categoryLabel, isOpen } from "../../src/lib/complaints.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};

eq("eight kinds, matching the database's list", CATEGORIES.map((c) => c.value), ["general", "academic", "fees", "staff_conduct", "facilities", "bullying", "safeguarding", "other"]);
eq("a kind's words", categoryLabel("bullying"), "Bullying");
eq("an unknown kind reads as itself", categoryLabel("zzz"), "zzz");
eq("five statuses for the complainant and the handler", [Object.keys(STATUS_LABELS).length, Object.keys(HANDLER_STATUS_LABELS).length], [5, 5]);
eq("new is open", isOpen("new"), true);
eq("waiting is open", isOpen("waiting"), true);
eq("resolved is not open", isOpen("resolved"), false);
eq("closed is not open", isOpen("closed"), false);
eq("the promise says it is recorded and needs a reason", [/recorded/.test(ANONYMOUS_PROMISE), /reason/.test(ANONYMOUS_PROMISE)], [true, true]);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
