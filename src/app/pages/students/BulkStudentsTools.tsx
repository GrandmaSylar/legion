import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  GraduationCap,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  bulkAdmitStudents,
  listClassRosterForPromotion,
  promoteClassStudents,
  type BulkAdmittedResult,
  type BulkStudentRowInput,
} from "../../../lib/data/students";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";
import {
  downloadStudentImportTemplate,
  parseStudentSpreadsheet,
} from "../../../lib/export/bulkSpreadsheet";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";

// ─── 1. Bulk Student Import Panel ────────────────────────────────────────────

export function BulkStudentImportPanel({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [targetClassId, setTargetClassId] = useState<string>("");
  const [rows, setRows] = useState<BulkStudentRowInput[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [admitted, setAdmitted] = useState<BulkAdmittedResult[] | null>(null);

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });
  const currentYear =
    yearsQ.data?.find((y) => y.isCurrent) ?? yearsQ.data?.[0] ?? null;

  const classesQ = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: Boolean(currentYear?.id),
  });

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileError(null);
    setAdmitted(null);
    try {
      const parsed = await parseStudentSpreadsheet(file);
      if (parsed.length === 0) {
        setFileError(
          "No valid student rows found. Ensure your sheet has 'First Name' and 'Last Name' (or 'Full Name') columns.",
        );
      }
      setRows(parsed);
    } catch (err) {
      setFileError(
        err instanceof Error
          ? err.message
          : "Could not read that spreadsheet file.",
      );
    }
  };

  const importMut = useMutation({
    mutationFn: () => bulkAdmitStudents(rows, targetClassId || null),
    onSuccess: (created) => {
      setAdmitted(created);
      setRows([]);
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["school-analytics"] });
    },
  });

  return (
    <section className="surface space-y-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <FileSpreadsheet className="size-4 text-primary" aria-hidden />
            Bulk CSV / Excel Student Import
          </h2>
          <p className="text-xs text-muted-foreground">
            Upload a `.csv` or `.xlsx` spreadsheet to admit multiple pupils at
            once, automatically issue admission numbers, and link guardians.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close bulk import"
          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Template Downloads & Class Selector */}
      <div className="grid gap-3 rounded-2xl border border-border bg-foreground/[0.02] p-3.5 sm:grid-cols-2 sm:items-end">
        <Field
          label={`Enrol imported pupils into class (${currentYear?.name ?? "current year"})`}
          htmlFor="bulk-import-class"
        >
          <NativeSelect
            id="bulk-import-class"
            value={targetClassId}
            onChange={(e) => setTargetClassId(e.target.value)}
          >
            <option value="">Admit without class placement</option>
            {(classesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.levelName} {c.section}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadStudentImportTemplate("xlsx")}
          >
            <Download className="size-3.5" aria-hidden />
            Excel Template (.xlsx)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadStudentImportTemplate("csv")}
          >
            <Download className="size-3.5" aria-hidden />
            CSV Template (.csv)
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={(e) => void handleFile(e)}
            className="hidden"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-3.5" aria-hidden />
            Choose CSV / Excel file
          </Button>
        </div>
      </div>

      {fileError ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {fileError}
        </p>
      ) : null}

      {/* Success Summary */}
      {admitted && admitted.length > 0 ? (
        <div className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs">
          <div className="font-semibold text-emerald-700 dark:text-emerald-300">
            Successfully admitted {admitted.length}{" "}
            {admitted.length === 1 ? "student" : "students"}!
          </div>
          <div className="max-h-36 overflow-y-auto">
            <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {admitted.map((a) => (
                <li key={a.studentId} className="truncate">
                  <strong className="font-mono">{a.admissionNo}</strong> ·{" "}
                  {a.fullName}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {/* Preview Table before Import */}
      {rows.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">
              Ready to Import ({rows.length}{" "}
              {rows.length === 1 ? "pupil" : "pupils"})
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows([])}
            >
              Clear list
            </Button>
          </div>

          <div className="max-h-64 overflow-auto rounded-2xl border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-foreground/[0.03] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pl-3 pr-2">Pupil Name</th>
                  <th className="py-2 px-2">Gender</th>
                  <th className="py-2 px-2">DOB</th>
                  <th className="py-2 px-2">Guardian</th>
                  <th className="py-2 px-2">Guardian Phone</th>
                  <th className="py-2 pl-2 pr-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pl-3 pr-2 font-medium">
                      {[r.firstName, r.middleName, r.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </td>
                    <td className="py-2 px-2 capitalize">
                      {r.gender || "—"}
                    </td>
                    <td className="py-2 px-2 tabular-nums">
                      {r.dateOfBirth || "—"}
                    </td>
                    <td className="py-2 px-2">
                      {r.guardianName
                        ? `${r.guardianName} (${r.guardianRelationship || "Guardian"})`
                        : "—"}
                    </td>
                    <td className="py-2 px-2 tabular-nums">
                      {r.guardianPhone || "—"}
                    </td>
                    <td className="py-2 pl-2 pr-3 text-right">
                      <button
                        type="button"
                        aria-label="Remove row"
                        onClick={() =>
                          setRows((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <FormMessage
            error={
              importMut.isError ? friendlyError(importMut.error) : null
            }
          />

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              disabled={importMut.isPending}
              onClick={() => importMut.mutate()}
            >
              <Check className="size-4" aria-hidden />
              {importMut.isPending
                ? "Importing students..."
                : `Admit ${rows.length} ${rows.length === 1 ? "student" : "students"}`}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ─── 2. Class Promotion & Graduation Wizard ──────────────────────────────────

export function ClassPromotionWizardPanel({
  onClose,
}: {
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const yearsQ = useQuery({
    queryKey: ["academic-years"],
    queryFn: listAcademicYears,
  });

  const defaultFromYear =
    yearsQ.data?.find((y) => y.isCurrent) ?? yearsQ.data?.[0] ?? null;

  const [fromYearId, setFromYearId] = useState<string>("");
  const [fromClassId, setFromClassId] = useState<string>("");
  const [action, setAction] = useState<"promote" | "repeat" | "graduate">(
    "promote",
  );
  const [toYearId, setToYearId] = useState<string>("");
  const [toClassId, setToClassId] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  const effectiveFromYearId = fromYearId || defaultFromYear?.id || "";
  const effectiveToYearId = toYearId || defaultFromYear?.id || "";

  const fromClassesQ = useQuery({
    queryKey: ["classes", effectiveFromYearId],
    queryFn: () => listClasses(effectiveFromYearId),
    enabled: Boolean(effectiveFromYearId),
  });

  const toClassesQ = useQuery({
    queryKey: ["classes", effectiveToYearId],
    queryFn: () => listClasses(effectiveToYearId),
    enabled: Boolean(effectiveToYearId) && action !== "graduate",
  });

  const activeFromClassId =
    fromClassId || fromClassesQ.data?.[0]?.id || "";

  const rosterQ = useQuery({
    queryKey: ["promotion-roster", activeFromClassId],
    queryFn: () => listClassRosterForPromotion(activeFromClassId),
    enabled: Boolean(activeFromClassId),
  });

  // Select all enrolled pupils when roster loads/changes
  const roster = rosterQ.data ?? [];
  const activeSelection = useMemo(() => {
    if (selectedIds.size > 0) {
      return new Set(
        [...selectedIds].filter((id) =>
          roster.some((r) => r.studentId === id),
        ),
      );
    }
    return new Set(roster.map((r) => r.studentId));
  }, [roster, selectedIds]);

  const toggleStudent = (id: string) => {
    setDoneMessage(null);
    setSelectedIds(() => {
      const next = new Set(activeSelection);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const promoteMut = useMutation({
    mutationFn: async () => {
      if (!activeFromClassId) throw new Error("Select a source class.");
      const ids = [...activeSelection];
      if (ids.length === 0) throw new Error("Select at least one pupil.");
      if (action !== "graduate" && !toClassId) {
        throw new Error("Select a destination class.");
      }
      return promoteClassStudents({
        fromClassId: activeFromClassId,
        studentIds: ids,
        action,
        toClassId: action === "graduate" ? null : toClassId,
      });
    },
    onSuccess: (count) => {
      setDoneMessage(
        action === "graduate"
          ? `Marked ${count} ${count === 1 ? "pupil" : "pupils"} as graduated/completed.`
          : `Moved ${count} ${count === 1 ? "pupil" : "pupils"} (${action}).`,
      );
      void qc.invalidateQueries({
        queryKey: ["promotion-roster", activeFromClassId],
      });
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["school-analytics"] });
    },
  });

  return (
    <section className="surface space-y-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <GraduationCap className="size-4 text-primary" aria-hidden />
            Class Promotion &amp; Graduation Wizard
          </h2>
          <p className="text-xs text-muted-foreground">
            Promote an entire class to the next level/year, reassign repeating
            pupils, or graduate final-year (Basic 9) candidates.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close promotion wizard"
          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Source -> Action -> Destination Controls */}
      <div className="grid gap-3 rounded-2xl border border-border bg-foreground/[0.02] p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="1. Source Year" htmlFor="promo-from-year">
          <NativeSelect
            id="promo-from-year"
            value={effectiveFromYearId}
            onChange={(e) => {
              setFromYearId(e.target.value);
              setFromClassId("");
              setSelectedIds(new Set());
            }}
          >
            {(yearsQ.data ?? []).map((y) => (
              <option key={y.id} value={y.id}>
                {y.name} {y.isCurrent ? "(Current)" : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="2. Source Class" htmlFor="promo-from-class">
          <NativeSelect
            id="promo-from-class"
            value={activeFromClassId}
            onChange={(e) => {
              setFromClassId(e.target.value);
              setSelectedIds(new Set());
            }}
          >
            {(fromClassesQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.levelName} {c.section} ({c.studentCount})
              </option>
            ))}
          </NativeSelect>
        </Field>

        <Field label="3. Action" htmlFor="promo-action">
          <NativeSelect
            id="promo-action"
            value={action}
            onChange={(e) =>
              setAction(e.target.value as "promote" | "repeat" | "graduate")
            }
          >
            <option value="promote">Promote to next class</option>
            <option value="repeat">Repeat / Reassign class</option>
            <option value="graduate">Graduate (Mark Completed)</option>
          </NativeSelect>
        </Field>

        {action !== "graduate" ? (
          <>
            <Field label="4. Target Year" htmlFor="promo-to-year">
              <NativeSelect
                id="promo-to-year"
                value={effectiveToYearId}
                onChange={(e) => {
                  setToYearId(e.target.value);
                  setToClassId("");
                }}
              >
                {(yearsQ.data ?? []).map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name} {y.isCurrent ? "(Current)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field label="5. Target Class" htmlFor="promo-to-class">
              <NativeSelect
                id="promo-to-class"
                value={toClassId}
                onChange={(e) => setToClassId(e.target.value)}
              >
                <option value="">Select destination class...</option>
                {(toClassesQ.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.levelName} {c.section}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </>
        ) : (
          <div className="flex items-center text-xs text-muted-foreground sm:col-span-2">
            Selected pupils will have their enrollment and student status marked
            as <strong>Completed</strong>. Their admission numbers remain
            permanently archived.
          </div>
        )}
      </div>

      {/* Roster selection */}
      {rosterQ.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : roster.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          No students are enrolled in this source class.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-muted-foreground">
              <Users className="size-3.5 text-primary" aria-hidden />
              Select Pupils ({activeSelection.size} of {roster.length} selected)
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSelectedIds(new Set(roster.map((r) => r.studentId)))
                }
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set(["__none__"]))}
              >
                Deselect all
              </Button>
            </div>
          </div>

          <div className="grid max-h-64 gap-1.5 overflow-y-auto rounded-2xl border border-border p-3 sm:grid-cols-2 lg:grid-cols-3">
            {roster.map((s) => {
              const checked = activeSelection.has(s.studentId);
              return (
                <label
                  key={s.studentId}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border/70 px-3 py-2 text-xs hover:bg-foreground/[0.03]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleStudent(s.studentId)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{s.fullName}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">
                      {s.admissionNo} · {s.enrollmentStatus}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>

          <FormMessage
            error={
              promoteMut.isError ? friendlyError(promoteMut.error) : null
            }
            ok={doneMessage}
          />

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={promoteMut.isPending || activeSelection.size === 0}
              onClick={() => promoteMut.mutate()}
            >
              <ArrowRight className="size-4" aria-hidden />
              {promoteMut.isPending
                ? "Processing..."
                : action === "graduate"
                  ? `Graduate ${activeSelection.size} ${activeSelection.size === 1 ? "pupil" : "pupils"}`
                  : `Apply ${action} (${activeSelection.size})`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

