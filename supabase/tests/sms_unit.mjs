// Unit tests for the SMS helpers (no network, no database).
// Run:  node supabase/tests/sms_unit.mjs      (Node 22.18+ runs the .ts files directly)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { countSegments, formatMoney, normalizePhone, parseNumberList, render } from "../../src/lib/sms.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
let passed = 0;
const failures = [];
const eq = (label, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) passed++;
  else failures.push(`${label}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
};

// the app and the Edge Function use one implementation, so they must not drift
eq(
  "src/lib/sms.ts and the function copy are identical",
  readFileSync(resolve(root, "src/lib/sms.ts"), "utf8") === readFileSync(resolve(root, "supabase/functions/messaging/sms.ts"), "utf8"),
  true,
);

// phone numbers as people write them
for (const [input, want] of [
  ["0244123456", "233244123456"],
  ["024 412 3456", "233244123456"],
  ["024-412-3456", "233244123456"],
  ["+233244123456", "233244123456"],
  ["+233 24 412 3456", "233244123456"],
  ["233244123456", "233244123456"],
  ["00233244123456", "233244123456"],
  ["244123456", "233244123456"],
  ["(024) 412 3456", "233244123456"],
  ["+447911123456", "447911123456"],
  ["", null],
  ["abc", null],
  ["024412345", null], // one digit short
  ["02441234567", null], // one digit long
  ["233244", null],
  ["+23324412345678", null],
]) eq(`normalizePhone(${JSON.stringify(input)})`, normalizePhone(input), want);

// how many SMS parts a message is billed as
const rep = (n) => "a".repeat(n);
eq("160 plain characters is one part", countSegments(rep(160)), { encoding: "GSM-7", length: 160, segments: 1 });
eq("161 plain characters is two parts", countSegments(rep(161)).segments, 2);
eq("306 plain characters is two parts", countSegments(rep(306)).segments, 2);
eq("307 plain characters is three parts", countSegments(rep(307)).segments, 3);
eq("an empty message is zero parts", countSegments("").segments, 0);
eq("a square bracket counts twice", countSegments("[").length, 2);
eq("80 euro signs fit in one part", countSegments("€".repeat(80)).segments, 1);
eq("81 euro signs need two parts", countSegments("€".repeat(81)).segments, 2);
eq("one emoji forces UCS-2", countSegments("Hello 😀").encoding, "UCS-2");
eq("70 UCS-2 characters is one part", countSegments("é".repeat(1) + "你".repeat(69)).segments, 1);
eq("71 UCS-2 characters is two parts", countSegments("你".repeat(71)).segments, 2);
eq("cedi and naira style symbols are plain", countSegments("Fees: GHS 100.00 - Thank you!").encoding, "GSM-7");

// filling placeholders
eq("fills known placeholders", render("Dear {parent}, {student} owes {balance}.", { parent: "Ama", student: "Kofi", balance: "GHS 50.00" }), "Dear Ama, Kofi owes GHS 50.00.");
eq("leaves a mistyped placeholder visible", render("Hi {parnet}", { parent: "Ama" }), "Hi {parnet}");
eq("empty value is removed and spacing tidied", render("Dear {parent}, balance {balance} .", { parent: "Ama", balance: "" }), "Dear Ama, balance.");
eq("collapses double spaces", render("a  b", {}), "a b");

// money
eq("formats a small amount", formatMoney(50), "GHS 50.00");
eq("formats thousands", formatMoney(1234.5), "GHS 1,234.50");
eq("formats millions", formatMoney(1234567.891), "GHS 1,234,567.89");
eq("formats zero", formatMoney(0), "GHS 0.00");

// pasted number lists
eq(
  "parses commas, new lines, repeats and junk",
  parseNumberList("0244123456, 0201234567\n233244123456;oops\n\n0244123456"),
  { valid: ["233244123456", "233201234567"], invalid: ["oops"], duplicates: 2 },
);

console.log(`${passed} checks passed${failures.length ? `, ${failures.length} FAILED` : ""}`);
for (const f of failures) console.log("FAIL " + f);
process.exit(failures.length ? 1 : 0);
