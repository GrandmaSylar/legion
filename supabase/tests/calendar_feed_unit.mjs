// Unit tests for the calendar feed: the link's wording, and that the function builds the file with the same code as the app.
// Run: node supabase/tests/calendar_feed_unit.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FEED_WARNING, feedUrl, looksLikeToken, webcalUrl } from "../../src/lib/calendarFeed.ts";
import { toIcs } from "../../src/lib/calendar.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const T = "0123456789abcdef".repeat(3);

eq("the address", feedUrl("https://x.supabase.co", T), `https://x.supabase.co/functions/v1/calendar-feed?t=${T}`);
eq("a trailing slash is not doubled", feedUrl("https://x.supabase.co/", T), `https://x.supabase.co/functions/v1/calendar-feed?t=${T}`);
eq("the webcal form", webcalUrl("https://x.supabase.co/functions/v1/calendar-feed?t=a"), "webcal://x.supabase.co/functions/v1/calendar-feed?t=a");
eq("a good token", looksLikeToken(T), true);
eq("too short", looksLikeToken("abc"), false);
eq("capital letters are not a token", looksLikeToken(T.toUpperCase()), false);
eq("neither is anything with other characters", looksLikeToken(T.slice(0, 47) + "g"), false);
eq("the warning says to keep it private and that a new link cancels the old", [/yourself/.test(FEED_WARNING), /old one stops/.test(FEED_WARNING)], [true, true]);

eq("the function's copy of the calendar code is identical to the app's",
  readFileSync(resolve(root, "src/lib/calendar.ts"), "utf8") === readFileSync(resolve(root, "supabase/functions/calendar-feed/calendar.ts"), "utf8"), true);

// What the feed's file looks like: one event with a time, one all-day run of days.
const ev = (o) => ({ id: "11111111-1111-1111-1111-111111111111", title: "Sports day", description: null, kind: "event", startsOn: "2026-11-20", endsOn: "2026-11-20", startsAt: null, endsAt: null, audience: "all", published: true, ...o });
const ics = toIcs([ev({}), ev({ id: "22222222-2222-2222-2222-222222222222", title: "Mid-term break", kind: "holiday", startsOn: "2026-12-01", endsOn: "2026-12-03" })], "Pinks Academy calendar", new Date("2026-11-04T12:00:00Z"));
eq("it is a calendar", ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"), true);
eq("two events", (ics.match(/BEGIN:VEVENT/g) ?? []).length, 2);
eq("an all-day event ends the day after its last day", ics.includes("DTSTART;VALUE=DATE:20261201") && ics.includes("DTEND;VALUE=DATE:20261204"), true);
eq("the stable id means an update replaces the event rather than adding another", ics.includes("UID:11111111-1111-1111-1111-111111111111@legion.phinova"), true);
eq("the refresh hint can be added after the calendar line", ics.replace("CALSCALE:GREGORIAN", "CALSCALE:GREGORIAN\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H").includes("REFRESH-INTERVAL;VALUE=DURATION:PT1H"), true);

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
