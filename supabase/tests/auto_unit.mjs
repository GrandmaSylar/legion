// Unit tests for the automatic sender's decisions. Run: node supabase/tests/auto_unit.mjs
import { STALE_AFTER_MS, isStale, sameSecret, withinSendingHours } from "../functions/messaging/auto.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};
const at = (hhmm) => new Date(`2026-11-04T${hhmm}:00Z`); // Accra is UTC

eq("noon is a fine time to text", withinSendingHours(at("12:00")), true);
eq("six in the morning is the first moment", withinSendingHours(at("06:00")), true);
eq("five fifty-nine is too early", withinSendingHours(at("05:59")), false);
eq("half past eight in the evening is fine", withinSendingHours(at("20:30")), true);
eq("nine at night is too late", withinSendingHours(at("21:00")), false);
eq("midnight is too late", withinSendingHours(at("00:00")), false);
eq("three in the morning is too early", withinSendingHours(at("03:00")), false);

const now = new Date("2026-11-05T12:00:00Z");
eq("a message from an hour ago is fresh", isStale("2026-11-05T11:00:00Z", now), false);
eq("one from 35 hours ago is fresh", isStale("2026-11-04T01:00:00Z", now), false);
eq("one from 37 hours ago is stale", isStale("2026-11-03T23:00:00Z", now), true);
eq("the limit is a day and a half", STALE_AFTER_MS, 129600000);

eq("equal secrets match", sameSecret("abc123", "abc123"), true);
eq("different secrets do not", sameSecret("abc123", "abc124"), false);
eq("secrets of different length do not", sameSecret("abc", "abc123"), false);
eq("an empty secret never matches a real one", sameSecret("", "abc123"), false);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
