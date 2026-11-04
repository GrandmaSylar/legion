// Unit tests for the clock-in helpers: how a pasted code is cleaned and how the offline queue is kept.
// Run: node supabase/tests/clockin_unit.mjs   (Node 22.6+ strips the types)
import { cleanCode, dayText, enqueue, flagLabel, prune, timeText } from "../../src/lib/clockin.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};

eq("digits only", cleanCode("123456"), "123456");
eq("a space in the middle", cleanCode("123 456"), "123456");
eq("a dash", cleanCode("123-456"), "123456");
eq("letters are dropped", cleanCode("a1b2c3d4e5f6"), "123456");
eq("more than six digits is cut", cleanCode("12345678"), "123456");
eq("nothing", cleanCode(""), "");

eq("a known flag", flagLabel("late"), "Late");
eq("a flag from the future reads as it is", flagLabel("something_new"), "something_new");

eq("a day", dayText("2026-11-04"), "Wed 4 Nov");
eq("a time in Accra (UTC)", timeText("2026-11-04T07:42:10Z"), "07:42");
eq("no time", timeText(null), "");

const now = Date.parse("2026-11-04T12:00:00Z");
const scan = (iso, code = "111111") => ({ code, kind: null, capturedAt: iso, device: "d" });
eq("a recent scan is kept", prune([scan("2026-11-04T11:55:00Z")], now).length, 1);
eq("a scan over two days old is dropped", prune([scan("2026-11-02T11:00:00Z")], now).length, 0);
eq("a scan from the future is dropped", prune([scan("2026-11-04T13:00:00Z")], now).length, 0);
eq("a scan with a broken time is dropped", prune([scan("not a time")], now).length, 0);
let q = [];
for (let i = 0; i < 25; i++) q = enqueue(q, scan("2026-11-04T11:00:00Z", String(100000 + i)), now);
eq("at most twenty are kept", q.length, 20);
eq("the newest are the ones kept", q[19].code, "100024");
eq("and the oldest of those", q[0].code, "100005");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
