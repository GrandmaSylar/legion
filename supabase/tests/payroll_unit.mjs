// Unit tests for the payroll helpers. Run: node supabase/tests/payroll_unit.mjs
import { RUN_STATUS_HELP, RUN_STATUS_LABELS, describeRule, money, monthEnd, monthLabel, parseAmount } from "../../src/lib/payroll.ts";

let fails = 0;
const eq = (label, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { fails++; console.log(`FAIL ${label}\n  got:  ${a}\n  want: ${b}`); } else console.log(`ok   ${label}`);
};

eq("money with thousands", money(1234.5), "GHS 1,234.50");
eq("money from a string", money("2600.00"), "GHS 2,600.00");
eq("money of nothing", money(null), "GHS 0.00");
eq("money in another currency", money(10, "USD"), "USD 10.00");
eq("a negative amount", money(-5), "-GHS 5.00");
eq("a bad number reads as zero", money("abc"), "GHS 0.00");
eq("a month label", monthLabel(2026, 10), "October 2026");
eq("a month that does not exist", monthLabel(2026, 13), "");
eq("amount typed with a comma", parseAmount("1,250.5"), 1250.5);
eq("amount with spaces", parseAmount(" 300 "), 300);
eq("an amount with three decimals is refused", parseAmount("1.234"), null);
eq("a negative amount is refused", parseAmount("-5"), null);
eq("words are refused", parseAmount("lots"), null);
eq("empty is refused", parseAmount(""), null);
eq("end of February in a leap year", monthEnd(2028, 2), "2028-02-29");
eq("end of February in an ordinary year", monthEnd(2027, 2), "2027-02-28");
eq("end of December", monthEnd(2026, 12), "2026-12-31");
eq("every status has words and a next step", Object.keys(RUN_STATUS_LABELS).every((k) => RUN_STATUS_HELP[k]), true);

const base = { kind: "deduction", method: "percent", base: "basic", rate: 5, fixedAmount: null, capBase: null, reducesTaxable: false, appliesTo: "all", bands: [] };
eq("a percent rule", describeRule(base), "5% of basic pay. Taken from the person's pay.");
eq("a percent with a cap, reducing taxable pay", describeRule({ ...base, capBase: 1500, reducesTaxable: true }), "5% of basic pay, counting at most GHS 1,500.00. Taken from the person's pay; reduces their taxable pay.");
eq("an employer cost for teaching staff", describeRule({ ...base, kind: "employer", rate: 12.5, appliesTo: "teaching" }), "12.5% of basic pay. Paid by the school, not taken from the person; teaching staff only.");
eq("a fixed amount", describeRule({ ...base, method: "fixed", rate: null, fixedAmount: 25 }), "GHS 25.00 a month. Taken from the person's pay.");
eq("bands", describeRule({ ...base, method: "bands", base: "taxable", rate: null, bands: [{ from: 0, to: 400, rate: 0 }, { from: 400, to: 1000, rate: 5 }, { from: 1000, to: null, rate: 10 }] }),
  "taxable pay (taxable earnings, less any deduction that reduces taxable pay), in slices: 0.00 to 400.00 at 0%; 400.00 to 1,000.00 at 5%; above 1,000.00 at 10%. Taken from the person's pay.");
eq("another currency", describeRule({ ...base, method: "fixed", rate: null, fixedAmount: 5 }, "USD"), "USD 5.00 a month. Taken from the person's pay.");

console.log(fails ? `${fails} FAILED` : "all passed");
process.exit(fails ? 1 : 0);
