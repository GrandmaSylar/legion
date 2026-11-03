import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Award,
  Building2,
  CalendarClock,
  Check,
  CreditCard,
  FileText,
  Layers,
  MessageSquare,
  Plus,
  Printer,
  Receipt,
  Trash2,
} from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import {
  assignStudentDiscount,
  batchGenerateTermInvoices,
  createDiscount,
  createFeeCategory,
  createFeeStructure,
  createInstallments,
  createStudentInvoice,
  deleteDiscount,
  deleteFeeStructure,
  deleteInstallment,
  extractInstallmentsFromInvoices,
  extractPaymentsFromInvoices,
  listDiscounts,
  listFeeCategories,
  listFeeStructures,
  listInvoices,
  listStudentDiscounts,
  recordPayment,
  removeStudentDiscount,
  type DiscountType,
  type InvoiceItemKind,
  type InvoiceRow,
  type MomoNetwork,
  type PaymentMethod,
} from "../../../lib/data/fees";
import {
  getInstitutionDetails,
  listAcademicYears,
  listClasses,
  listLevels,
  listTerms,
} from "../../../lib/data/setup";
import { listStudents } from "../../../lib/data/students";
import { friendlyError } from "../../../lib/data/errors";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { ReceiptView } from "./ReceiptView";
import { ExpensesTab } from "./ExpensesTab";

function formatMoney(amount: number, currency = "GHS"): string {
  return `${currency} ${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StatusBadge({ status }: { status: InvoiceRow["status"] }) {
  const styles: Record<InvoiceRow["status"], string> = {
    paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    unpaid: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
    void: "bg-foreground/10 text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex rounded-lg px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default function Fees() {
  const { roles } = useAuth();
  const canManage = hasAnyRole(roles, ["school_admin", "accountant"]);
  const canAccessExpenses = hasAnyRole(roles, ["school_admin", "accountant", "principal"]);
  const canApproveExpenses = hasAnyRole(roles, ["school_admin", "principal"]);
  const canReadInvoices = hasAnyRole(roles, ["school_admin", "accountant", "parent"]);
  const isAdmin = hasAnyRole(roles, ["school_admin"]);
  const qc = useQueryClient();

  const [selectedReceiptId, setSelectedReceiptId] = useState<string | null>(null);
  const [payInvoiceId, setPayInvoiceId] = useState<string>("");
  const [payAmount, setPayAmount] = useState<string>("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payNetwork, setPayNetwork] = useState<MomoNetwork>("mtn");
  const [payReference, setPayReference] = useState<string>("");
  const [payDate, setPayDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10),
  );

  // Batch term billing state
  const [batchTermId, setBatchTermId] = useState<string>("");
  const [batchClassId, setBatchClassId] = useState<string>("");
  const [batchDueOn, setBatchDueOn] = useState<string>("");
  const [batchIncludeOneOff, setBatchIncludeOneOff] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);

  // Single invoice creation state
  const [invStudentId, setInvStudentId] = useState<string>("");
  const [invTermId, setInvTermId] = useState<string>("");
  const [invDueOn, setInvDueOn] = useState<string>("");
  const [invItems, setInvItems] = useState<
    { kind: InvoiceItemKind; description: string; amount: string }[]
  >([
    { kind: "fee", description: "Tuition & Academic Fees", amount: "" },
  ]);

  // Scholarships & discounts state
  const [discName, setDiscName] = useState("");
  const [discType, setDiscType] = useState<DiscountType>("percent");
  const [discValue, setDiscValue] = useState("");
  const [discCatId, setDiscCatId] = useState("");
  const [discReason, setDiscReason] = useState("");

  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignDiscountId, setAssignDiscountId] = useState("");

  // Installment plan state
  const [instInvoiceId, setInstInvoiceId] = useState("");
  const [instRows, setInstRows] = useState<
    { dueOn: string; amount: string }[]
  >([
    { dueOn: "", amount: "" },
    { dueOn: "", amount: "" },
  ]);

  // Fee structure state
  const [newCatName, setNewCatName] = useState("");
  const [newCatOneOff, setNewCatOneOff] = useState(false);
  const [structCatId, setStructCatId] = useState("");
  const [structLevelId, setStructLevelId] = useState("");
  const [structTermId, setStructTermId] = useState("");
  const [structAmount, setStructAmount] = useState("");

  const institutionQ = useQuery({
    queryKey: ["institution-details"],
    queryFn: getInstitutionDetails,
  });

  const invoicesQ = useQuery({
    queryKey: ["invoices"],
    queryFn: listInvoices,
  });

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });
  const currentYear =
    yearsQ.data?.find((y) => y.isCurrent) ?? yearsQ.data?.[0] ?? null;

  const termsQ = useQuery({
    queryKey: ["terms"],
    queryFn: listTerms,
  });
  const currentYearTerms = useMemo(
    () =>
      (termsQ.data ?? []).filter(
        (t) => !currentYear || t.academicYearId === currentYear.id,
      ),
    [termsQ.data, currentYear],
  );

  const classesQ = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: Boolean(currentYear?.id) && canManage,
  });

  const studentsQ = useQuery({
    queryKey: ["students-for-billing", currentYear?.id],
    queryFn: () =>
      listStudents({
        search: "",
        classId: "",
        status: "active",
        yearId: currentYear?.id ?? null,
        page: 0,
      }),
    enabled: canManage,
  });

  const categoriesQ = useQuery({
    queryKey: ["fee-categories"],
    queryFn: listFeeCategories,
    enabled: canManage,
  });

  const structuresQ = useQuery({
    queryKey: ["fee-structures"],
    queryFn: listFeeStructures,
    enabled: canManage,
  });

  const discountsQ = useQuery({
    queryKey: ["discounts"],
    queryFn: listDiscounts,
    enabled: canManage,
  });

  const studentDiscountsQ = useQuery({
    queryKey: ["student-discounts", currentYear?.id],
    queryFn: () => listStudentDiscounts(currentYear?.id ?? null),
    enabled: canManage,
  });

  const levelsQ = useQuery({
    queryKey: ["levels"],
    queryFn: listLevels,
    enabled: canManage,
  });

  const allPayments = useMemo(
    () => extractPaymentsFromInvoices(invoicesQ.data ?? []),
    [invoicesQ.data],
  );

  const allInstallments = useMemo(
    () => extractInstallmentsFromInvoices(invoicesQ.data ?? []),
    [invoicesQ.data],
  );

  const selectedPayment = useMemo(
    () => allPayments.find((p) => p.id === selectedReceiptId) ?? null,
    [allPayments, selectedReceiptId],
  );

  const unpaidInvoices = useMemo(
    () =>
      (invoicesQ.data ?? []).filter(
        (inv) => inv.status !== "paid" && inv.status !== "void",
      ),
    [invoicesQ.data],
  );

  const activePayInvoice =
    unpaidInvoices.find((inv) => inv.id === payInvoiceId) ??
    unpaidInvoices[0] ??
    null;

  const activeInstInvoice =
    unpaidInvoices.find((inv) => inv.id === instInvoiceId) ??
    unpaidInvoices[0] ??
    null;

  const effectiveBatchTermId =
    batchTermId ||
    currentYearTerms.find((t) => t.isCurrent)?.id ||
    currentYearTerms[0]?.id ||
    "";

  const recordPaymentMut = useMutation({
    mutationFn: async () => {
      const targetInv = activePayInvoice;
      if (!targetInv) throw new Error("Select an invoice to record payment against.");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("Enter a valid payment amount greater than 0.");
      return recordPayment({
        invoiceId: targetInv.id,
        amount: amt,
        method: payMethod,
        network: payMethod === "mobile_money" ? payNetwork : null,
        reference: payReference,
        paidOn: payDate,
      });
    },
    onSuccess: async (created) => {
      setPayAmount("");
      setPayReference("");
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["school-analytics"] });
      setSelectedReceiptId(created.id);
    },
  });

  const batchBillMut = useMutation({
    mutationFn: async () => {
      if (!effectiveBatchTermId) {
        throw new Error("Select a term to generate batch invoices for.");
      }
      return batchGenerateTermInvoices({
        termId: effectiveBatchTermId,
        classId: batchClassId || null,
        dueOn: batchDueOn || null,
        includeOneOff: batchIncludeOneOff,
      });
    },
    onSuccess: async (res) => {
      setBatchResult(
        `Created ${res.invoicesCreated} term ${res.invoicesCreated === 1 ? "invoice" : "invoices"} (${formatMoney(res.totalBilled, currency)} net billed after scholarships/discounts). Skipped ${res.studentsSkipped} ${res.studentsSkipped === 1 ? "pupil" : "pupils"} (already billed or no matching fee schedule).`,
      );
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["school-analytics"] });
    },
  });

  const createInvoiceMut = useMutation({
    mutationFn: async () => {
      if (!invStudentId) throw new Error("Select a student to bill.");
      const parsedItems = invItems
        .map((it) => ({
          kind: it.kind,
          description: it.description.trim(),
          amount: Number(it.amount),
        }))
        .filter((it) => it.description && !Number.isNaN(it.amount) && it.amount > 0);
      if (parsedItems.length === 0) {
        throw new Error("Add at least one fee item with a description and positive amount.");
      }
      return createStudentInvoice({
        studentId: invStudentId,
        termId: invTermId || null,
        dueOn: invDueOn || null,
        items: parsedItems,
      });
    },
    onSuccess: async (newInvoiceId) => {
      setInvItems([{ kind: "fee", description: "Tuition & Academic Fees", amount: "" }]);
      setPayInvoiceId(newInvoiceId);
      await qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["school-analytics"] });
    },
  });

  const createDiscountMut = useMutation({
    mutationFn: () =>
      createDiscount({
        name: discName,
        type: discType,
        value: Number(discValue),
        appliesToCategoryId: discCatId || null,
        reason: discReason,
      }),
    onSuccess: () => {
      setDiscName("");
      setDiscValue("");
      setDiscCatId("");
      setDiscReason("");
      void qc.invalidateQueries({ queryKey: ["discounts"] });
    },
  });

  const delDiscountMut = useMutation({
    mutationFn: (id: string) => deleteDiscount(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["discounts"] });
    },
  });

  const assignDiscMut = useMutation({
    mutationFn: () => {
      if (!currentYear) throw new Error("Set a current academic year first.");
      return assignStudentDiscount({
        studentId: assignStudentId,
        discountId: assignDiscountId,
        academicYearId: currentYear.id,
      });
    },
    onSuccess: () => {
      setAssignStudentId("");
      setAssignDiscountId("");
      void qc.invalidateQueries({ queryKey: ["student-discounts"] });
    },
  });

  const removeStudentDiscMut = useMutation({
    mutationFn: (id: string) => removeStudentDiscount(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["student-discounts"] });
    },
  });

  const saveInstallmentsMut = useMutation({
    mutationFn: async () => {
      if (!activeInstInvoice) throw new Error("Select an invoice.");
      const parsed = instRows
        .map((r) => ({ dueOn: r.dueOn, amount: Number(r.amount) }))
        .filter((r) => r.dueOn && !Number.isNaN(r.amount) && r.amount > 0);
      if (parsed.length === 0) {
        throw new Error("Enter at least one installment date and amount.");
      }
      await createInstallments({
        invoiceId: activeInstInvoice.id,
        items: parsed,
      });
    },
    onSuccess: () => {
      setInstRows([
        { dueOn: "", amount: "" },
        { dueOn: "", amount: "" },
      ]);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const delInstallmentMut = useMutation({
    mutationFn: (id: string) => deleteInstallment(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const addCatMut = useMutation({
    mutationFn: () =>
      createFeeCategory({ name: newCatName, isOneOff: newCatOneOff }),
    onSuccess: () => {
      setNewCatName("");
      setNewCatOneOff(false);
      void qc.invalidateQueries({ queryKey: ["fee-categories"] });
    },
  });

  const addStructMut = useMutation({
    mutationFn: () =>
      createFeeStructure({
        feeCategoryId: structCatId,
        levelId: structLevelId,
        termId: structTermId || null,
        amount: Number(structAmount),
      }),
    onSuccess: () => {
      setStructAmount("");
      void qc.invalidateQueries({ queryKey: ["fee-structures"] });
    },
  });

  const delStructMut = useMutation({
    mutationFn: (id: string) => deleteFeeStructure(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["fee-structures"] });
    },
  });

  const currency = institutionQ.data?.currency || "GHS";
  const todayIso = new Date().toISOString().slice(0, 10);

  if (selectedPayment && institutionQ.data) {
    return (
      <ReceiptView
        institution={institutionQ.data}
        payment={selectedPayment}
        canConfigureSchool={isAdmin}
        onBack={() => setSelectedReceiptId(null)}
      />
    );
  }

  const totalBilled = (invoicesQ.data ?? []).reduce(
    (s, inv) => s + inv.totalAmount,
    0,
  );
  const totalCollected = (invoicesQ.data ?? []).reduce(
    (s, inv) => s + inv.paidAmount,
    0,
  );
  const totalOutstanding = (invoicesQ.data ?? []).reduce(
    (s, inv) => s + inv.balance,
    0,
  );

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Fees, billing &amp; receipts</h1>
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Batch term billing, scholarships & discounts, installment plans, and official school receipts."
              : "View fee statements, installment schedules, and official payment receipts."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
        {hasAnyRole(roles, ["school_admin", "principal", "accountant"]) ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/messages?audience=fee_balance&template=fee_reminder">
              <MessageSquare className="size-4" aria-hidden />
              Remind parents who owe
            </Link>
          </Button>
        ) : null}
        {isAdmin ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/settings">
              <Building2 className="size-4" aria-hidden />
              Configure school details on receipts
            </Link>
          </Button>
        ) : null}
        </div>
      </div>

      {/* Summary KPI cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <section className="surface p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Total Billed ({(invoicesQ.data ?? []).length} invoices)
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {invoicesQ.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              formatMoney(totalBilled, currency)
            )}
          </div>
        </section>
        <section className="surface p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Total Collected ({allPayments.length} receipts)
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums dark:text-emerald-400">
            {invoicesQ.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              formatMoney(totalCollected, currency)
            )}
          </div>
        </section>
        <section className="surface p-4">
          <div className="text-xs font-medium text-muted-foreground">
            Outstanding Arrears
          </div>
          <div className="mt-1 text-2xl font-bold text-rose-700 tabular-nums dark:text-rose-400">
            {invoicesQ.isLoading ? (
              <Skeleton className="h-7 w-28" />
            ) : (
              formatMoney(totalOutstanding, currency)
            )}
          </div>
        </section>
      </div>

      <Tabs defaultValue={canReadInvoices ? "receipts" : "expenses"} className="space-y-4">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="receipts">
            Receipts &amp; Payments ({allPayments.length})
          </TabsTrigger>
          <TabsTrigger value="invoices">
            Invoices &amp; Batch Billing ({(invoicesQ.data ?? []).length})
          </TabsTrigger>
          {canManage ? (
            <TabsTrigger value="discounts">
              Scholarships &amp; Discounts ({(studentDiscountsQ.data ?? []).length})
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="installments">
            Installment Plans ({allInstallments.length})
          </TabsTrigger>
          {canManage ? (
            <TabsTrigger value="structure">Fee Structure</TabsTrigger>
          ) : null}
          {canAccessExpenses ? (
            <TabsTrigger value="expenses">Expenses &amp; Approvals</TabsTrigger>
          ) : null}
        </TabsList>

        {/* ─── TAB 1: RECEIPTS & PAYMENTS ─────────────────────────────────── */}
        <TabsContent value="receipts" className="space-y-5">
          {canManage ? (
            <section className="surface space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <CreditCard className="size-4 text-primary" aria-hidden />
                    Receive payment &amp; issue official receipt
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Recording a payment automatically generates a numbered{" "}
                    <code className="rounded bg-foreground/5 px-1 py-0.5">
                      RCT/YYYY/NNNNNN
                    </code>{" "}
                    receipt with your school crest, address, and contact details.
                  </p>
                </div>
              </div>

              {unpaidInvoices.length === 0 ? (
                <p className="rounded-xl border border-border bg-foreground/[0.02] p-3 text-sm text-muted-foreground">
                  All existing invoices are settled, or no invoices have been billed yet. Open the{" "}
                  <strong>Invoices &amp; Batch Billing</strong> tab to bill pupils first.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    recordPaymentMut.mutate();
                  }}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
                >
                  <div className="sm:col-span-2">
                    <Field label="Student invoice" htmlFor="pay-invoice">
                      <NativeSelect
                        id="pay-invoice"
                        value={activePayInvoice?.id ?? ""}
                        onChange={(e) => {
                          setPayInvoiceId(e.target.value);
                          const found = unpaidInvoices.find(
                            (i) => i.id === e.target.value,
                          );
                          if (found) setPayAmount(String(found.balance));
                        }}
                      >
                        {unpaidInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.number} · {inv.studentName} (Bal:{" "}
                            {formatMoney(inv.balance, currency)})
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>

                  <Field label={`Amount (${currency})`} htmlFor="pay-amount">
                    <Input
                      id="pay-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder={
                        activePayInvoice
                          ? String(activePayInvoice.balance)
                          : "0.00"
                      }
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      required
                    />
                  </Field>

                  <Field label="Method" htmlFor="pay-method">
                    <NativeSelect
                      id="pay-method"
                      value={payMethod}
                      onChange={(e) =>
                        setPayMethod(e.target.value as PaymentMethod)
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="mobile_money">Mobile Money</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </NativeSelect>
                  </Field>

                  {payMethod === "mobile_money" ? (
                    <Field label="MoMo network" htmlFor="pay-network">
                      <NativeSelect
                        id="pay-network"
                        value={payNetwork}
                        onChange={(e) =>
                          setPayNetwork(e.target.value as MomoNetwork)
                        }
                      >
                        <option value="mtn">MTN MoMo</option>
                        <option value="telecel">Telecel Cash</option>
                        <option value="airteltigo">AT Money</option>
                      </NativeSelect>
                    </Field>
                  ) : (
                    <Field label="Reference / slip no." htmlFor="pay-ref">
                      <Input
                        id="pay-ref"
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        placeholder="Optional ref..."
                      />
                    </Field>
                  )}

                  <Field label="Payment date" htmlFor="pay-date">
                    <Input
                      id="pay-date"
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                    />
                  </Field>

                  <div className="flex items-end justify-end sm:col-span-2 lg:col-span-6">
                    <Button
                      type="submit"
                      disabled={recordPaymentMut.isPending}
                    >
                      <Receipt className="size-4" aria-hidden />
                      {recordPaymentMut.isPending
                        ? "Issuing receipt..."
                        : "Record payment & open receipt"}
                    </Button>
                  </div>
                </form>
              )}

              <FormMessage
                error={
                  recordPaymentMut.isError
                    ? friendlyError(recordPaymentMut.error)
                    : null
                }
              />
            </section>
          ) : null}

          <section className="surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <Receipt className="size-4 text-primary" aria-hidden />
                Official Payment Receipts
              </h2>
              <span className="text-xs text-muted-foreground">
                Select any payment to view or print its official receipt with school details.
              </span>
            </div>

            {invoicesQ.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : allPayments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No payment receipts have been issued yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-foreground/[0.02] text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 pl-4 pr-2">Receipt No.</th>
                      <th className="py-3 px-2">Date</th>
                      <th className="py-3 px-2">Student</th>
                      <th className="py-3 px-2">Invoice</th>
                      <th className="py-3 px-2">Method</th>
                      <th className="py-3 px-2 text-right">Amount</th>
                      <th className="py-3 pl-2 pr-4 text-right">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allPayments.map((p) => (
                      <tr key={p.id} className="hover:bg-foreground/[0.02]">
                        <td className="py-3 pl-4 pr-2 font-mono font-semibold tabular-nums">
                          {p.receiptNo}
                        </td>
                        <td className="py-3 px-2 tabular-nums text-muted-foreground">
                          {p.paidOn}
                        </td>
                        <td className="py-3 px-2">
                          <div className="font-medium">{p.studentName}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.studentAdmissionNo}
                          </div>
                        </td>
                        <td className="py-3 px-2 font-mono text-xs">
                          {p.invoiceNumber}
                        </td>
                        <td className="py-3 px-2 capitalize text-xs text-muted-foreground">
                          {p.method.replace("_", " ")}
                          {p.network ? ` (${p.network.toUpperCase()})` : ""}
                        </td>
                        <td className="py-3 px-2 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatMoney(p.amount, currency)}
                        </td>
                        <td className="py-3 pl-2 pr-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedReceiptId(p.id)}
                          >
                            <Printer className="size-3.5" aria-hidden />
                            View / Print Receipt
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ─── TAB 2: INVOICES & BATCH BILLING ────────────────────────────── */}
        <TabsContent value="invoices" className="space-y-5">
          {canManage ? (
            <>
              {/* One-Click Batch Class / Term Billing */}
              <section className="surface space-y-4 p-5">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Layers className="size-4 text-primary" aria-hidden />
                    One-click batch term billing (with automatic scholarships &amp; discounts)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Automatically generate term invoices for all active pupils in a class (or the entire school) using your configured{" "}
                    <strong>Fee Structure</strong> rates and deduct any assigned{" "}
                    <strong>Student Scholarships / Discounts</strong>. Pupils who already have an invoice for the selected term are safely skipped.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setBatchResult(null);
                    batchBillMut.mutate();
                  }}
                  className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
                >
                  <Field label="Term to bill" htmlFor="batch-term">
                    <NativeSelect
                      id="batch-term"
                      value={effectiveBatchTermId}
                      onChange={(e) => setBatchTermId(e.target.value)}
                      required
                    >
                      <option value="">Select term...</option>
                      {currentYearTerms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} {t.isCurrent ? "(Current)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Target class" htmlFor="batch-class">
                    <NativeSelect
                      id="batch-class"
                      value={batchClassId}
                      onChange={(e) => setBatchClassId(e.target.value)}
                    >
                      <option value="">Entire school (all classes)</option>
                      {(classesQ.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.levelName} {c.section} ({c.studentCount} pupils)
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Due date (optional)" htmlFor="batch-due">
                    <Input
                      id="batch-due"
                      type="date"
                      value={batchDueOn}
                      onChange={(e) => setBatchDueOn(e.target.value)}
                    />
                  </Field>

                  <label className="flex items-center gap-2 pt-6 text-xs">
                    <input
                      type="checkbox"
                      checked={batchIncludeOneOff}
                      onChange={(e) => setBatchIncludeOneOff(e.target.checked)}
                    />
                    Include one-off admission fees
                  </label>

                  <div className="flex items-end justify-end">
                    <Button
                      type="submit"
                      disabled={batchBillMut.isPending || !effectiveBatchTermId}
                    >
                      <Layers className="size-4" aria-hidden />
                      {batchBillMut.isPending
                        ? "Generating invoices..."
                        : "Run batch billing"}
                    </Button>
                  </div>
                </form>

                <FormMessage
                  error={
                    batchBillMut.isError
                      ? friendlyError(batchBillMut.error)
                      : null
                  }
                  ok={batchResult}
                />
              </section>

              {/* Single Custom Invoice Creation */}
              <section className="surface space-y-4 p-5">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <FileText className="size-4 text-primary" aria-hidden />
                    Create custom individual invoice
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Bill an individual pupil for custom items, uniforms, books, or brought-forward arrears.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createInvoiceMut.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Student" htmlFor="inv-student">
                      <NativeSelect
                        id="inv-student"
                        value={invStudentId}
                        onChange={(e) => setInvStudentId(e.target.value)}
                        required
                      >
                        <option value="">Select active student...</option>
                        {(studentsQ.data?.rows ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.fullName} ({s.admissionNo}
                            {s.className ? ` · ${s.className}` : ""})
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>

                    <Field label="Term (optional)" htmlFor="inv-term">
                      <NativeSelect
                        id="inv-term"
                        value={invTermId}
                        onChange={(e) => setInvTermId(e.target.value)}
                      >
                        <option value="">General / All terms</option>
                        {currentYearTerms.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>

                    <Field label="Due date (optional)" htmlFor="inv-due">
                      <Input
                        id="inv-due"
                        type="date"
                        value={invDueOn}
                        onChange={(e) => setInvDueOn(e.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Invoice Line Items
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setInvItems((prev) => [
                            ...prev,
                            { kind: "fee", description: "", amount: "" },
                          ])
                        }
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add item
                      </Button>
                    </div>

                    {invItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="grid gap-2 sm:grid-cols-[9rem_1fr_10rem_auto]"
                      >
                        <NativeSelect
                          aria-label={`Line item ${idx + 1} type`}
                          value={item.kind}
                          onChange={(e) =>
                            setInvItems((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      kind: e.target.value as InvoiceItemKind,
                                    }
                                  : row,
                              ),
                            )
                          }
                        >
                          <option value="fee">Fee</option>
                          <option value="arrears">Arrears</option>
                          <option value="discount">Discount (-)</option>
                        </NativeSelect>
                        <Input
                          placeholder="Item description (e.g. Tuition Fee, Uniform, Scholarship)"
                          value={item.description}
                          onChange={(e) =>
                            setInvItems((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, description: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          required
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder={`Amount (${currency})`}
                          value={item.amount}
                          onChange={(e) =>
                            setInvItems((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? { ...row, amount: e.target.value }
                                  : row,
                              ),
                            )
                          }
                          required
                        />
                        {invItems.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove line item"
                            onClick={() =>
                              setInvItems((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                          >
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <FormMessage
                    error={
                      createInvoiceMut.isError
                        ? friendlyError(createInvoiceMut.error)
                        : null
                    }
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={createInvoiceMut.isPending}
                    >
                      <Check className="size-4" aria-hidden />
                      {createInvoiceMut.isPending
                        ? "Issuing invoice..."
                        : "Issue invoice"}
                    </Button>
                  </div>
                </form>
              </section>
            </>
          ) : null}

          <section className="surface overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold">Invoices</h2>
            </div>

            {invoicesQ.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (invoicesQ.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No invoices have been created yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-foreground/[0.02] text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 pl-4 pr-2">Invoice No.</th>
                      <th className="py-3 px-2">Student</th>
                      <th className="py-3 px-2">Term</th>
                      <th className="py-3 px-2">Status</th>
                      <th className="py-3 px-2 text-right">Billed</th>
                      <th className="py-3 px-2 text-right">Paid</th>
                      <th className="py-3 pl-2 pr-4 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(invoicesQ.data ?? []).map((inv) => (
                      <tr key={inv.id} className="hover:bg-foreground/[0.02]">
                        <td className="py-3 pl-4 pr-2 font-mono font-semibold">
                          {inv.number}
                        </td>
                        <td className="py-3 px-2">
                          <div className="font-medium">{inv.studentName}</div>
                          <div className="text-xs text-muted-foreground">
                            {inv.studentAdmissionNo}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-xs text-muted-foreground">
                          {inv.termName ?? "General"}
                        </td>
                        <td className="py-3 px-2">
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums">
                          {formatMoney(inv.totalAmount, currency)}
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatMoney(inv.paidAmount, currency)}
                        </td>
                        <td className="py-3 pl-2 pr-4 text-right font-mono font-semibold tabular-nums">
                          {formatMoney(inv.balance, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ─── TAB 3: SCHOLARSHIPS & DISCOUNTS ────────────────────────────── */}
        {canManage ? (
          <TabsContent value="discounts" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Define Scholarship / Discount Schemes */}
              <section className="surface space-y-4 p-5">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    <Award className="size-4 text-primary" aria-hidden />
                    Scholarship &amp; discount schemes
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Define reusable percentage or fixed-amount concessions (e.g. Academic Scholarship 50%, Staff Ward 25%, Sibling Discount).
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!discName.trim()) return;
                    createDiscountMut.mutate();
                  }}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <Field label="Scheme name" htmlFor="disc-name">
                    <Input
                      id="disc-name"
                      value={discName}
                      onChange={(e) => setDiscName(e.target.value)}
                      placeholder="e.g. Staff Ward Concession"
                      required
                    />
                  </Field>

                  <Field label="Type" htmlFor="disc-type">
                    <NativeSelect
                      id="disc-type"
                      value={discType}
                      onChange={(e) =>
                        setDiscType(e.target.value as DiscountType)
                      }
                    >
                      <option value="percent">Percentage (%)</option>
                      <option value="fixed">Fixed Amount ({currency})</option>
                    </NativeSelect>
                  </Field>

                  <Field
                    label={
                      discType === "percent"
                        ? "Percentage (0–100%)"
                        : `Fixed deduction (${currency})`
                    }
                    htmlFor="disc-val"
                  >
                    <Input
                      id="disc-val"
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={discType === "percent" ? "100" : undefined}
                      value={discValue}
                      onChange={(e) => setDiscValue(e.target.value)}
                      required
                    />
                  </Field>

                  <Field label="Applies to category" htmlFor="disc-cat">
                    <NativeSelect
                      id="disc-cat"
                      value={discCatId}
                      onChange={(e) => setDiscCatId(e.target.value)}
                    >
                      <option value="">All billed fee categories</option>
                      {(categoriesQ.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} only
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Reason / policy note (optional)" htmlFor="disc-reason">
                      <Input
                        id="disc-reason"
                        value={discReason}
                        onChange={(e) => setDiscReason(e.target.value)}
                        placeholder="e.g. Approved by School Board for 3+ siblings"
                      />
                    </Field>
                  </div>

                  <div className="flex justify-end sm:col-span-2">
                    <Button
                      type="submit"
                      disabled={createDiscountMut.isPending}
                    >
                      <Plus className="size-4" aria-hidden />
                      Save discount scheme
                    </Button>
                  </div>
                </form>

                <FormMessage
                  error={
                    createDiscountMut.isError
                      ? friendlyError(createDiscountMut.error)
                      : null
                  }
                />

                <ul className="divide-y divide-border text-sm">
                  {(discountsQ.data ?? []).map((d) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-2 py-2.5"
                    >
                      <div>
                        <div className="font-medium">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.type === "percent"
                            ? `${d.value}% off`
                            : `${formatMoney(d.value, currency)} off`}{" "}
                          ·{" "}
                          {d.appliesToCategoryName
                            ? `${d.appliesToCategoryName} only`
                            : "All fees"}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${d.name}`}
                        onClick={() => delDiscountMut.mutate(d.id)}
                      >
                        <Trash2 className="size-4 text-muted-foreground" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Assign Scholarship / Discount to Student */}
              <section className="surface space-y-4 p-5">
                <div>
                  <h2 className="text-base font-semibold">
                    Awarded student scholarships &amp; discounts (
                    {currentYear?.name ?? "Current year"})
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Assign a scheme to a pupil so batch term billing automatically applies the deduction.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!assignStudentId || !assignDiscountId) return;
                    assignDiscMut.mutate();
                  }}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <Field label="Student" htmlFor="assign-disc-student">
                    <NativeSelect
                      id="assign-disc-student"
                      value={assignStudentId}
                      onChange={(e) => setAssignStudentId(e.target.value)}
                      required
                    >
                      <option value="">Select active student...</option>
                      {(studentsQ.data?.rows ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.fullName} ({s.admissionNo})
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Scholarship / Discount" htmlFor="assign-disc-scheme">
                    <NativeSelect
                      id="assign-disc-scheme"
                      value={assignDiscountId}
                      onChange={(e) => setAssignDiscountId(e.target.value)}
                      required
                    >
                      <option value="">Select scheme...</option>
                      {(discountsQ.data ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} (
                          {d.type === "percent"
                            ? `${d.value}%`
                            : formatMoney(d.value, currency)}
                          )
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <div className="flex justify-end sm:col-span-2">
                    <Button type="submit" disabled={assignDiscMut.isPending}>
                      <Check className="size-4" aria-hidden />
                      Assign to student
                    </Button>
                  </div>
                </form>

                <FormMessage
                  error={
                    assignDiscMut.isError
                      ? friendlyError(assignDiscMut.error)
                      : null
                  }
                />

                {(studentDiscountsQ.data ?? []).length === 0 ? (
                  <p className="py-4 text-xs text-muted-foreground">
                    No student scholarships or discounts assigned for this academic year yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border text-sm">
                    {(studentDiscountsQ.data ?? []).map((sd) => (
                      <li
                        key={sd.id}
                        className="flex items-center justify-between gap-2 py-2.5"
                      >
                        <div>
                          <div className="font-medium">{sd.studentName}</div>
                          <div className="text-xs text-muted-foreground">
                            {sd.studentAdmissionNo} ·{" "}
                            <span className="font-semibold text-primary">
                              {sd.discountName}
                            </span>{" "}
                            (
                            {sd.discountType === "percent"
                              ? `${sd.discountValue}%`
                              : formatMoney(sd.discountValue, currency)}
                            )
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Remove student discount"
                          onClick={() => removeStudentDiscMut.mutate(sd.id)}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </TabsContent>
        ) : null}

        {/* ─── TAB 4: INSTALLMENT PLANS ───────────────────────────────────── */}
        <TabsContent value="installments" className="space-y-5">
          {canManage ? (
            <section className="surface space-y-4 p-5">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold">
                  <CalendarClock className="size-4 text-primary" aria-hidden />
                  Create payment installment schedule
                </h2>
                <p className="text-xs text-muted-foreground">
                  Break an unpaid or partial pupil invoice into agreed installment due dates and amounts.
                </p>
              </div>

              {unpaidInvoices.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No unpaid invoices available to attach an installment plan to.
                </p>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveInstallmentsMut.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="max-w-md">
                    <Field label="Target invoice" htmlFor="inst-invoice">
                      <NativeSelect
                        id="inst-invoice"
                        value={activeInstInvoice?.id ?? ""}
                        onChange={(e) => setInstInvoiceId(e.target.value)}
                      >
                        {unpaidInvoices.map((inv) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.number} · {inv.studentName} (Bal:{" "}
                            {formatMoney(inv.balance, currency)})
                          </option>
                        ))}
                      </NativeSelect>
                    </Field>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Installment Tranches
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setInstRows((prev) => [
                            ...prev,
                            { dueOn: "", amount: "" },
                          ])
                        }
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add tranche
                      </Button>
                    </div>

                    {instRows.map((row, idx) => (
                      <div
                        key={idx}
                        className="grid gap-2 sm:grid-cols-[12rem_12rem_auto]"
                      >
                        <Input
                          type="date"
                          value={row.dueOn}
                          onChange={(e) =>
                            setInstRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, dueOn: e.target.value }
                                  : r,
                              ),
                            )
                          }
                          required
                        />
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          placeholder={`Amount (${currency})`}
                          value={row.amount}
                          onChange={(e) =>
                            setInstRows((prev) =>
                              prev.map((r, i) =>
                                i === idx
                                  ? { ...r, amount: e.target.value }
                                  : r,
                              ),
                            )
                          }
                          required
                        />
                        {instRows.length > 1 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove tranche"
                            onClick={() =>
                              setInstRows((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                          >
                            <Trash2 className="size-4 text-muted-foreground" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <FormMessage
                    error={
                      saveInstallmentsMut.isError
                        ? friendlyError(saveInstallmentsMut.error)
                        : null
                    }
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={saveInstallmentsMut.isPending}
                    >
                      <Check className="size-4" aria-hidden />
                      Save installment schedule
                    </Button>
                  </div>
                </form>
              )}
            </section>
          ) : null}

          <section className="surface overflow-hidden">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-semibold">
                Agreed Installment Schedules &amp; Due Dates
              </h2>
            </div>

            {allInstallments.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No installment schedules have been recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-foreground/[0.02] text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-3 pl-4 pr-2">Due Date</th>
                      <th className="py-3 px-2">Student</th>
                      <th className="py-3 px-2">Invoice</th>
                      <th className="py-3 px-2 text-right">Tranche Amount</th>
                      <th className="py-3 px-2 text-right">Invoice Balance</th>
                      <th className="py-3 pl-2 pr-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allInstallments.map((inst) => {
                      const isOverdue =
                        inst.invoiceStatus !== "paid" &&
                        inst.dueOn < todayIso;
                      return (
                        <tr
                          key={inst.id}
                          className="hover:bg-foreground/[0.02]"
                        >
                          <td className="py-3 pl-4 pr-2 font-mono tabular-nums">
                            {inst.dueOn}
                            {isOverdue ? (
                              <span className="ml-2 rounded bg-rose-500/15 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase text-rose-700 dark:text-rose-300">
                                Overdue
                              </span>
                            ) : null}
                          </td>
                          <td className="py-3 px-2">
                            <div className="font-medium">
                              {inst.studentName}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {inst.studentAdmissionNo}
                            </div>
                          </td>
                          <td className="py-3 px-2 font-mono text-xs">
                            {inst.invoiceNumber}
                          </td>
                          <td className="py-3 px-2 text-right font-mono font-semibold tabular-nums">
                            {formatMoney(inst.amount, currency)}
                          </td>
                          <td className="py-3 px-2 text-right font-mono tabular-nums text-muted-foreground">
                            {formatMoney(inst.invoiceBalance, currency)}
                          </td>
                          <td className="py-3 pl-2 pr-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <StatusBadge status={inst.invoiceStatus} />
                              {canManage ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  aria-label="Delete installment"
                                  onClick={() =>
                                    delInstallmentMut.mutate(inst.id)
                                  }
                                  className="size-7"
                                >
                                  <Trash2 className="size-3.5 text-muted-foreground" />
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>

        {/* ─── TAB 5: FEE STRUCTURE (Admin/Accountant) ────────────────────── */}
        {canManage ? (
          <TabsContent value="structure" className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="surface space-y-4 p-5">
                <div>
                  <h2 className="text-base font-semibold">Fee categories</h2>
                  <p className="text-xs text-muted-foreground">
                    Standard billing heads (e.g. Tuition, PTA Levy, ICT, Admission Fee).
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newCatName.trim()) return;
                    addCatMut.mutate();
                  }}
                  className="flex flex-wrap items-end gap-2"
                >
                  <div className="min-w-48 flex-1">
                    <Field label="Category name" htmlFor="cat-name">
                      <Input
                        id="cat-name"
                        value={newCatName}
                        onChange={(e) => setNewCatName(e.target.value)}
                        placeholder="e.g. Tuition Fee"
                        required
                      />
                    </Field>
                  </div>
                  <label className="flex h-10 items-center gap-2 px-2 text-xs">
                    <input
                      type="checkbox"
                      checked={newCatOneOff}
                      onChange={(e) => setNewCatOneOff(e.target.checked)}
                    />
                    One-off fee
                  </label>
                  <Button type="submit" disabled={addCatMut.isPending}>
                    <Plus className="size-4" aria-hidden />
                    Add
                  </Button>
                </form>

                <FormMessage
                  error={
                    addCatMut.isError ? friendlyError(addCatMut.error) : null
                  }
                />

                <ul className="divide-y divide-border text-sm">
                  {(categoriesQ.data ?? []).map((cat) => (
                    <li
                      key={cat.id}
                      className="flex items-center justify-between py-2"
                    >
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {cat.isOneOff ? "One-off" : "Per term"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="surface space-y-4 p-5">
                <div>
                  <h2 className="text-base font-semibold">
                    Level fee schedule
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Standard fee amounts by school level and term.
                  </p>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addStructMut.mutate();
                  }}
                  className="grid gap-3 sm:grid-cols-2"
                >
                  <Field label="Category" htmlFor="struct-cat">
                    <NativeSelect
                      id="struct-cat"
                      value={structCatId}
                      onChange={(e) => setStructCatId(e.target.value)}
                      required
                    >
                      <option value="">Select category...</option>
                      {(categoriesQ.data ?? []).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Level" htmlFor="struct-level">
                    <NativeSelect
                      id="struct-level"
                      value={structLevelId}
                      onChange={(e) => setStructLevelId(e.target.value)}
                      required
                    >
                      <option value="">Select level...</option>
                      {(levelsQ.data ?? []).map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label="Term (optional)" htmlFor="struct-term">
                    <NativeSelect
                      id="struct-term"
                      value={structTermId}
                      onChange={(e) => setStructTermId(e.target.value)}
                    >
                      <option value="">All terms / One-off</option>
                      {currentYearTerms.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>

                  <Field label={`Amount (${currency})`} htmlFor="struct-amount">
                    <Input
                      id="struct-amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={structAmount}
                      onChange={(e) => setStructAmount(e.target.value)}
                      required
                    />
                  </Field>

                  <div className="flex justify-end sm:col-span-2">
                    <Button type="submit" disabled={addStructMut.isPending}>
                      <Plus className="size-4" aria-hidden />
                      Save schedule rate
                    </Button>
                  </div>
                </form>

                <FormMessage
                  error={
                    addStructMut.isError
                      ? friendlyError(addStructMut.error)
                      : null
                  }
                />

                <ul className="divide-y divide-border text-sm">
                  {(structuresQ.data ?? []).map((st) => (
                    <li
                      key={st.id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div>
                        <span className="font-medium">{st.categoryName}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          · {st.levelName}
                          {st.termName ? ` (${st.termName})` : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold tabular-nums">
                          {formatMoney(st.amount, currency)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Delete schedule rate"
                          onClick={() => delStructMut.mutate(st.id)}
                        >
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </TabsContent>
        ) : null}

        {canAccessExpenses ? (
          <TabsContent value="expenses">
            <ExpensesTab
              currency={currency}
              terms={currentYearTerms}
              canManageFinance={canManage}
              canApproveExpenses={canApproveExpenses}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
