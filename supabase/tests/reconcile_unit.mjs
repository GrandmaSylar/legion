// Unit tests for the Paystack reconciliation logic. No network, no database.
// Run: node supabase/tests/reconcile_unit.mjs   (Node 22.6+ strips the types)
import { reconcile } from "../functions/paystack/reconcile.ts";

let passed = 0, failed = 0;
const check = (label, ok) => { ok ? passed++ : (failed++, console.log("FAIL " + label)); };
const all = () => true;
const tx = (reference, amount, extra = {}) => ({ reference, amount, channel: "card", paid_at: "2026-11-03T10:00:00Z", ...extra });
const att = (reference, amount, status = "success", extra = {}) => ({ reference, amount, status, paid_at: "2026-11-03T10:00:00Z", receipt_no: "RCT/1", ...extra });

// everything lines up
let r = reconcile([tx("A", 10000), tx("B", 5050)], [att("A", 100), att("B", 50.5)], all);
check("matching payments are matched", r.matched === 2);
check("pesewas become cedis", r.paystack.total === 150.5);
check("no issues when all match", !r.paidNotRecorded.length && !r.notFromLegion.length && !r.recordedNotInPaystack.length && !r.amountMismatch.length);
check("legion total agrees", r.legion.total === 150.5 && r.legion.count === 2);

// money taken but no receipt
r = reconcile([tx("A", 10000)], [att("A", 100, "pending", { paid_at: null })], all);
check("paid but still pending is flagged as not recorded", r.paidNotRecorded.length === 1 && r.paidNotRecorded[0].reference === "A");
r = reconcile([tx("A", 10000)], [att("A", 100, "failed", { paid_at: null })], all);
check("paid but marked failed is flagged as not recorded", r.paidNotRecorded.length === 1);

// a payment Legion never asked for
r = reconcile([tx("Z", 2500)], [], all);
check("a payment Legion did not start is reported separately", r.notFromLegion.length === 1 && r.matched === 0 && !r.paidNotRecorded.length);

// a receipt Paystack does not know
r = reconcile([], [att("A", 100)], all);
check("a receipt with no Paystack payment is flagged", r.recordedNotInPaystack.length === 1 && r.recordedNotInPaystack[0].receiptNo === "RCT/1");
r = reconcile([], [att("A", 100)], all, false);
check("an incomplete Paystack list does not accuse anyone", r.recordedNotInPaystack.length === 0 && r.legion.count === 1);
r = reconcile([], [att("A", 100, "pending", { paid_at: null }), att("B", 100, "failed", { paid_at: null })], all);
check("attempts that never succeeded are not receipts", r.recordedNotInPaystack.length === 0 && r.legion.count === 0);

// different amounts
r = reconcile([tx("A", 12000)], [att("A", 100)], all);
check("an amount difference is flagged", r.amountMismatch.length === 1 && r.amountMismatch[0].paystackAmount === 120 && r.amountMismatch[0].legionAmount === 100 && r.matched === 0);

// refunded receipts still match what Paystack received
r = reconcile([tx("A", 10000)], [att("A", 100, "refunded")], all);
check("a refunded payment still matches Paystack's record", r.matched === 1 && !r.paidNotRecorded.length);
check("and a refunded receipt is not counted in Legion's total", r.legion.total === 0 && r.legion.count === 0);

// the period decides which receipts count
r = reconcile([], [att("A", 100, "success", { paid_at: "2026-10-01T10:00:00Z" })], (p) => p >= "2026-11-01");
check("a receipt outside the period is ignored", r.recordedNotInPaystack.length === 0 && r.legion.count === 0);

// fees and expected payout
r = reconcile([tx("A", 10000, { fees: 195 }), tx("B", 5000, { fees: 98 })], [att("A", 100), att("B", 50)], all);
check("fees are summed in cedis", r.paystack.fees === 2.93);
check("expected payout is received minus fees", r.paystack.net === 147.07);
r = reconcile([tx("A", 10000)], [att("A", 100)], all);
check("without fee information, none is claimed", r.paystack.fees === null && r.paystack.net === null);

// a repeated row is counted once
r = reconcile([tx("A", 10000), tx("A", 10000)], [att("A", 100)], all);
check("a repeated transaction is counted once", r.paystack.count === 1 && r.paystack.total === 100 && r.matched === 1);

// rounding
r = reconcile([tx("A", 1), tx("B", 2), tx("C", 3)], [att("A", 0.01), att("B", 0.02), att("C", 0.03)], all);
check("tiny amounts add up exactly", r.paystack.total === 0.06 && r.legion.total === 0.06 && r.matched === 3);

console.log(`${passed} checks passed${failed ? `, ${failed} FAILED` : ""}`);
process.exit(failed ? 1 : 0);
