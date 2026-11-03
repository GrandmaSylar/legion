import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  FolderKanban,
  ImagePlus,
  Plus,
  Search,
  Trash2,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import {
  createExpense,
  createExpenseCategory,
  deleteExpense,
  deleteExpenseCategory,
  listExpenseCategories,
  listExpenses,
  reviewExpense,
  type ExpenseRow,
  type ExpenseStatus,
  type PaymentMethod,
} from "../../../lib/data/fees";
import { type Term } from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";

function formatMoney(amount: number, currency = "GHS"): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function resizeReceiptImage(file: File, maxDim = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read receipt image"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Invalid image file"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  const styles: Record<ExpenseStatus, string> = {
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    approved: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    rejected: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  };
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export function ExpensesTab({
  currency,
  terms,
  canPayExpenses,
  canDeleteExpenses,
  canManageCategories,
  canApproveExpenses,
}: {
  currency: string;
  terms: Term[];
  canPayExpenses: boolean;
  canDeleteExpenses: boolean;
  canManageCategories: boolean;
  canApproveExpenses: boolean;
}) {
  const qc = useQueryClient();
  const receiptInputRef = useRef<HTMLInputElement>(null);

  const categoriesQ = useQuery({
    queryKey: ["expense-categories"],
    queryFn: listExpenseCategories,
  });

  const expensesQ = useQuery({
    queryKey: ["expenses"],
    queryFn: listExpenses,
  });

  // New expense form state
  const [catId, setCatId] = useState("");
  const [termId, setTermId] = useState("");
  const [title, setTitle] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  // New category form state
  const [newCatName, setNewCatName] = useState("");
  const [newCatBudget, setNewCatBudget] = useState("");

  // Filters & review state
  const [statusFilter, setStatusFilter] = useState<"all" | ExpenseStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [reviewingExpense, setReviewingExpense] = useState<{
    expense: ExpenseRow;
    decision: ExpenseStatus;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [previewReceipt, setPreviewReceipt] = useState<ExpenseRow | null>(null);

  const summary = useMemo(() => {
    const rows = expensesQ.data ?? [];
    let pendingTotal = 0;
    let pendingCount = 0;
    let approvedTotal = 0;
    let approvedCount = 0;
    let paidTotal = 0;
    let paidCount = 0;

    for (const r of rows) {
      if (r.status === "pending") {
        pendingTotal += r.amount;
        pendingCount += 1;
      } else if (r.status === "approved") {
        approvedTotal += r.amount;
        approvedCount += 1;
      } else if (r.status === "paid") {
        paidTotal += r.amount;
        paidCount += 1;
      }
    }
    return {
      pendingTotal,
      pendingCount,
      approvedTotal,
      approvedCount,
      paidTotal,
      paidCount,
    };
  }, [expensesQ.data]);

  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of expensesQ.data ?? []) {
      if (r.status === "approved" || r.status === "paid") {
        map.set(
          r.expenseCategoryId,
          (map.get(r.expenseCategoryId) ?? 0) + r.amount,
        );
      }
    }
    return map;
  }, [expensesQ.data]);

  const filteredExpenses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return (expensesQ.data ?? []).filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (categoryFilter !== "all" && r.expenseCategoryId !== categoryFilter)
        return false;
      if (q) {
        const hay = [
          r.voucherNo,
          r.title,
          r.vendor ?? "",
          r.categoryName,
          r.requestedByName ?? "",
          r.reference ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expensesQ.data, statusFilter, categoryFilter, searchQuery]);

  const createExpMut = useMutation({
    mutationFn: () => {
      const amt = Number(amount);
      if (!catId) throw new Error("Select an expense category.");
      if (!title.trim()) throw new Error("Enter an expense title or description.");
      if (!Number.isFinite(amt) || amt <= 0)
        throw new Error("Enter a valid amount greater than 0.");
      return createExpense({
        expenseCategoryId: catId,
        termId: termId || null,
        title,
        vendor,
        amount: amt,
        incurredOn,
        paymentMethod,
        reference,
        notes,
        receiptUrl,
      });
    },
    onSuccess: () => {
      setTitle("");
      setVendor("");
      setAmount("");
      setReference("");
      setNotes("");
      setReceiptUrl(null);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const reviewMut = useMutation({
    mutationFn: (input: {
      expenseId: string;
      decision: ExpenseStatus;
      reviewNote?: string;
    }) => reviewExpense(input),
    onSuccess: () => {
      setReviewingExpense(null);
      setReviewNote("");
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });

  const deleteExpMut = useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expenses"] });
    },
  });

  const createCatMut = useMutation({
    mutationFn: () => {
      if (!newCatName.trim()) throw new Error("Enter a category name.");
      const limit = newCatBudget.trim() ? Number(newCatBudget) : null;
      if (limit !== null && (!Number.isFinite(limit) || limit < 0)) {
        throw new Error("Budget limit must be a positive number.");
      }
      return createExpenseCategory({
        name: newCatName,
        budgetLimit: limit,
      });
    },
    onSuccess: () => {
      setNewCatName("");
      setNewCatBudget("");
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });

  const deleteCatMut = useMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["expense-categories"] });
    },
  });

  async function handleReceiptFileChange(e: ChangeEvent<HTMLInputElement>) {
    setReceiptError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setReceiptError("Please select an image file (PNG, JPG, or WEBP).");
      return;
    }
    try {
      const dataUrl = await resizeReceiptImage(file);
      setReceiptUrl(dataUrl);
    } catch (err) {
      setReceiptError(friendlyError(err));
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Pending Approval</span>
            <Clock className="size-4 text-amber-500" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-amber-600 dark:text-amber-400">
            {expensesQ.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              formatMoney(summary.pendingTotal, currency)
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.pendingCount}{" "}
            {summary.pendingCount === 1 ? "voucher" : "vouchers"} awaiting sign-off
          </p>
        </div>

        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Approved (Unpaid)</span>
            <FileCheck2 className="size-4 text-sky-500" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-sky-600 dark:text-sky-400">
            {expensesQ.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              formatMoney(summary.approvedTotal, currency)
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.approvedCount} approved{" "}
            {summary.approvedCount === 1 ? "voucher" : "vouchers"} ready for payment
          </p>
        </div>

        <div className="surface p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Total Disbursed (Paid)</span>
            <Wallet className="size-4 text-emerald-500" aria-hidden />
          </div>
          <div className="mt-2 text-2xl font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
            {expensesQ.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              formatMoney(summary.paidTotal, currency)
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.paidCount} completed{" "}
            {summary.paidCount === 1 ? "expenditure" : "expenditures"}
          </p>
        </div>
      </div>

      {/* Log Expense & Approval Queue */}
      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        {/* Submit Expense Form */}
        <section className="surface h-fit space-y-4 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Plus className="size-4 text-primary" aria-hidden /> Submit Expense
              Voucher
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Record a school expenditure request with vendor details and an
              optional receipt image for approval.
            </p>
          </div>

          <Field label="Expense Category" htmlFor="exp-cat">
            <NativeSelect
              id="exp-cat"
              value={catId}
              onChange={(e) => setCatId(e.target.value)}
            >
              <option value="">Select category…</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.budgetLimit !== null
                    ? ` (Budget: ${formatMoney(c.budgetLimit, currency)})`
                    : ""}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Title / Description" htmlFor="exp-title">
            <Input
              id="exp-title"
              placeholder="e.g. ECG Prepaid Electricity Top-up"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Amount (${currency})`} htmlFor="exp-amount">
              <Input
                id="exp-amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <Field label="Date Incurred" htmlFor="exp-date">
              <Input
                id="exp-date"
                type="date"
                value={incurredOn}
                onChange={(e) => setIncurredOn(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor / Payee (Optional)" htmlFor="exp-vendor">
              <Input
                id="exp-vendor"
                placeholder="e.g. Kingdom Books"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
              />
            </Field>
            <Field label="Term (Optional)" htmlFor="exp-term">
              <NativeSelect
                id="exp-term"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
              >
                <option value="">General / All terms</option>
                {terms.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Payment Method" htmlFor="exp-method">
              <NativeSelect
                id="exp-method"
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(e.target.value as PaymentMethod)
                }
              >
                <option value="cash">Cash</option>
                <option value="mobile_money">Mobile Money</option>
                <option value="bank_transfer">Bank Transfer / Cheque</option>
              </NativeSelect>
            </Field>
            <Field label="Ref / Invoice # (Optional)" htmlFor="exp-ref">
              <Input
                id="exp-ref"
                placeholder="MoMo ID or Inv #"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Notes / Justification (Optional)" htmlFor="exp-notes">
            <Input
              id="exp-notes"
              placeholder="Purpose or breakdown of items purchased"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="space-y-2">
            <span className="block text-xs font-medium text-muted-foreground">
              Receipt / Supporting Photo (Optional)
            </span>
            <input
              ref={receiptInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => void handleReceiptFileChange(e)}
              className="hidden"
            />
            {receiptUrl ? (
              <div className="relative overflow-hidden rounded-xl border border-border bg-foreground/[0.02] p-2">
                <img
                  src={receiptUrl}
                  alt="Attached receipt preview"
                  className="max-h-36 w-full rounded-lg object-contain"
                />
                <button
                  type="button"
                  onClick={() => {
                    setReceiptUrl(null);
                    if (receiptInputRef.current)
                      receiptInputRef.current.value = "";
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:underline"
                >
                  <Trash2 className="size-3.5" aria-hidden /> Remove attachment
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => receiptInputRef.current?.click()}
              >
                <ImagePlus className="size-4" aria-hidden /> Attach Receipt Photo
              </Button>
            )}
            {receiptError ? <FormMessage error={receiptError} /> : null}
          </div>

          {createExpMut.isError ? (
            <FormMessage error={friendlyError(createExpMut.error)} />
          ) : null}

          <Button
            type="button"
            className="w-full"
            disabled={createExpMut.isPending}
            onClick={() => createExpMut.mutate()}
          >
            <Plus className="size-4" aria-hidden />{" "}
            {createExpMut.isPending
              ? "Submitting voucher…"
              : "Submit Expense Voucher"}
          </Button>
        </section>

        {/* Expense Approval & Disbursement Ledger */}
        <section className="surface space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">
                Expense Vouchers &amp; Approval Queue
              </h2>
              <p className="text-xs text-muted-foreground">
                School Admins and Principals can approve or reject pending
                vouchers; Accountants and Admins can mark approved vouchers as
                paid.
              </p>
            </div>
          </div>

          {/* Filter bar */}
          <div className="grid gap-2 sm:grid-cols-[1fr_11rem_12rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                placeholder="Search voucher #, title, vendor…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <NativeSelect
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as "all" | ExpenseStatus)
              }
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending approval</option>
              <option value="approved">Approved</option>
              <option value="paid">Paid</option>
              <option value="rejected">Rejected</option>
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {(categoriesQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Inline Review Dialog Banner when Approving/Rejecting */}
          {reviewingExpense ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                    {reviewingExpense.decision === "approved"
                      ? "Approve Expense Voucher"
                      : reviewingExpense.decision === "rejected"
                        ? "Reject Expense Voucher"
                        : "Mark Expense Voucher as Paid"}
                  </div>
                  <div className="mt-0.5 text-sm font-medium">
                    {reviewingExpense.expense.voucherNo} ·{" "}
                    {reviewingExpense.expense.title} (
                    {formatMoney(reviewingExpense.expense.amount, currency)})
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setReviewingExpense(null);
                    setReviewNote("");
                  }}
                  className="rounded-lg p-1 text-muted-foreground hover:bg-foreground/10"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <Field
                label="Reviewer / Payment Note (Optional)"
                htmlFor="exp-review-note"
              >
                <Input
                  id="exp-review-note"
                  placeholder={
                    reviewingExpense.decision === "rejected"
                      ? "Reason for rejection…"
                      : "Optional approval or payment remark…"
                  }
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
              </Field>

              {reviewMut.isError ? (
                <FormMessage error={friendlyError(reviewMut.error)} />
              ) : null}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setReviewingExpense(null);
                    setReviewNote("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={reviewMut.isPending}
                  onClick={() =>
                    reviewMut.mutate({
                      expenseId: reviewingExpense.expense.id,
                      decision: reviewingExpense.decision,
                      reviewNote,
                    })
                  }
                >
                  <Check className="size-4" aria-hidden /> Confirm{" "}
                  {reviewingExpense.decision === "approved"
                    ? "Approval"
                    : reviewingExpense.decision === "rejected"
                      ? "Rejection"
                      : "Payment"}
                </Button>
              </div>
            </div>
          ) : null}

          {expensesQ.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No expense vouchers match the current filter.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2.5 pr-3">Voucher</th>
                    <th className="py-2.5 pr-3">Details</th>
                    <th className="py-2.5 pr-3">Category</th>
                    <th className="py-2.5 pr-3">Amount</th>
                    <th className="py-2.5 pr-3">Status &amp; Audit</th>
                    <th className="py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="align-top">
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold">
                          {exp.voucherNo}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {exp.incurredOn}
                        </div>
                        {exp.termName ? (
                          <div className="text-[11px] text-muted-foreground">
                            {exp.termName}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="font-medium">{exp.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {exp.vendor ? `Vendor: ${exp.vendor} · ` : ""}
                          Method: {exp.paymentMethod.replace("_", " ")}
                          {exp.reference ? ` (${exp.reference})` : ""}
                        </div>
                        {exp.notes ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {exp.notes}
                          </div>
                        ) : null}
                        {exp.receiptUrl ? (
                          <button
                            type="button"
                            onClick={() => setPreviewReceipt(exp)}
                            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <Eye className="size-3.5" aria-hidden /> View
                            Attached Receipt
                          </button>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        <span className="inline-flex rounded-lg bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium">
                          {exp.categoryName}
                        </span>
                      </td>
                      <td className="py-3 pr-3 font-semibold tabular-nums whitespace-nowrap">
                        {formatMoney(exp.amount, currency)}
                      </td>
                      <td className="py-3 pr-3">
                        <ExpenseStatusBadge status={exp.status} />
                        {exp.requestedByName ? (
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            By: {exp.requestedByName}
                          </div>
                        ) : null}
                        {exp.reviewedByName ? (
                          <div className="text-[11px] text-muted-foreground">
                            Reviewed: {exp.reviewedByName}
                          </div>
                        ) : null}
                        {exp.reviewNote ? (
                          <div className="mt-0.5 rounded bg-foreground/[0.04] px-1.5 py-0.5 text-[11px] italic text-muted-foreground">
                            “{exp.reviewNote}”
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 text-right whitespace-nowrap">
                        <div className="inline-flex flex-wrap justify-end gap-1.5">
                          {exp.status === "pending" && canApproveExpenses ? (
                            <>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-emerald-700 dark:text-emerald-300"
                                onClick={() => {
                                  setReviewingExpense({
                                    expense: exp,
                                    decision: "approved",
                                  });
                                  setReviewNote("");
                                }}
                              >
                                <CheckCircle2 className="size-3.5" aria-hidden />{" "}
                                Approve
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs text-rose-600"
                                onClick={() => {
                                  setReviewingExpense({
                                    expense: exp,
                                    decision: "rejected",
                                  });
                                  setReviewNote("");
                                }}
                              >
                                <XCircle className="size-3.5" aria-hidden />{" "}
                                Reject
                              </Button>
                            </>
                          ) : null}

                          {exp.status === "approved" && canPayExpenses ? (
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 px-2.5 text-xs"
                              onClick={() => {
                                setReviewingExpense({
                                  expense: exp,
                                  decision: "paid",
                                });
                                setReviewNote("");
                              }}
                            >
                              <Wallet className="size-3.5" aria-hidden /> Mark
                              Paid
                            </Button>
                          ) : null}

                          {(exp.status === "pending" ||
                            exp.status === "rejected") &&
                          canDeleteExpenses ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs text-rose-600"
                              disabled={deleteExpMut.isPending}
                              onClick={() => deleteExpMut.mutate(exp.id)}
                              title="Delete voucher"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Expense Categories & Budget Ceilings */}
      <section className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <FolderKanban className="size-4 text-primary" aria-hidden />{" "}
              Expense Categories &amp; Budget Utilisation
            </h2>
            <p className="text-xs text-muted-foreground">
              Track approved and paid expenditures against each category’s
              target budget ceiling.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(categoriesQ.data ?? []).map((cat) => {
            const spent = spendByCategory.get(cat.id) ?? 0;
            const limit = cat.budgetLimit;
            const pct =
              limit && limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : null;
            const overBudget = limit !== null && limit > 0 && spent > limit;

            return (
              <div
                key={cat.id}
                className="rounded-2xl border border-border p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{cat.name}</div>
                  {canManageCategories && spent === 0 ? (
                    <button
                      type="button"
                      onClick={() => deleteCatMut.mutate(cat.id)}
                      className="text-muted-foreground hover:text-rose-600"
                      title="Delete unused category"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  ) : null}
                </div>
                <div className="text-lg font-bold tabular-nums">
                  {formatMoney(spent, currency)}
                </div>
                {limit !== null ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Budget: {formatMoney(limit, currency)}</span>
                      <span
                        className={
                          overBudget
                            ? "font-semibold text-rose-600"
                            : "font-medium"
                        }
                      >
                        {Math.round((spent / limit) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                      <div
                        className={`h-full rounded-full ${
                          overBudget
                            ? "bg-rose-500"
                            : (pct ?? 0) >= 80
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                        }`}
                        style={{ width: `${pct ?? 0}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground">
                    No budget ceiling set
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canManageCategories ? (
          <div className="border-t border-border pt-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
              <Field label="New Expense Category Name" htmlFor="new-exp-cat">
                <Input
                  id="new-exp-cat"
                  placeholder="e.g. Laboratory Consumables"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
              </Field>
              <Field
                label={`Budget Limit (${currency}, Optional)`}
                htmlFor="new-exp-budget"
              >
                <Input
                  id="new-exp-budget"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 2500.00"
                  value={newCatBudget}
                  onChange={(e) => setNewCatBudget(e.target.value)}
                />
              </Field>
              <Button
                type="button"
                variant="outline"
                disabled={createCatMut.isPending}
                onClick={() => createCatMut.mutate()}
              >
                <Plus className="size-4" aria-hidden /> Add Category
              </Button>
            </div>
            {createCatMut.isError ? (
              <div className="mt-2">
                <FormMessage error={friendlyError(createCatMut.error)} />
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Receipt Preview Lightbox Modal */}
      {previewReceipt && previewReceipt.receiptUrl ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Receipt attachment preview"
        >
          <div className="surface max-h-[90vh] w-full max-w-xl overflow-y-auto p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">
                  {previewReceipt.voucherNo} · {previewReceipt.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(previewReceipt.amount, currency)} ·{" "}
                  {previewReceipt.incurredOn}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPreviewReceipt(null)}
              >
                <X className="size-4" aria-hidden /> Close
              </Button>
            </div>
            <div className="overflow-hidden rounded-xl border border-border bg-black/5 p-2">
              <img
                src={previewReceipt.receiptUrl}
                alt={`Receipt for ${previewReceipt.voucherNo}`}
                className="max-h-[68vh] w-full object-contain"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
