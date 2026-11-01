import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Check,
  Download,
  Edit3,
  FileSpreadsheet,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  UserCog,
  UserRoundCog,
  X,
} from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import {
  bulkCreateStaff,
  createStaffMember,
  listStaff,
  updateStaffMember,
  type BulkStaffRowInput,
  type StaffMember,
  type StaffStatus,
  type StaffType,
} from "../../../lib/data/staff";
import { friendlyError } from "../../../lib/data/errors";
import {
  downloadStaffImportTemplate,
  parseStaffSpreadsheet,
} from "../../../lib/export/bulkSpreadsheet";
import { StudentAvatar } from "../../components/StudentAvatar";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { cn } from "../../components/ui/utils";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const STATUS_BADGE: Record<StaffStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  on_leave: {
    label: "On leave",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  left: {
    label: "Left",
    className: "bg-foreground/10 text-muted-foreground",
  },
};

type StaffFilter = "all" | "teaching" | "non_teaching" | "on_leave" | "left";

export default function StaffPage() {
  const { roles } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const canEdit = hasAnyRole(roles, ["school_admin", "hr_officer"]);
  const isAdmin = hasAnyRole(roles, ["school_admin"]);

  const [filter, setFilter] = useState<StaffFilter>("all");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState<BulkStaffRowInput[]>([]);
  const [bulkFileError, setBulkFileError] = useState<string | null>(null);
  const [bulkSuccessCount, setBulkSuccessCount] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [type, setType] = useState<StaffType>("teaching");
  const [roleTitle, setRoleTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hiredOn, setHiredOn] = useState("");
  const [status, setStatus] = useState<StaffStatus>("active");

  const staffQuery = useQuery({
    queryKey: ["staff-directory"],
    queryFn: listStaff,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["staff-directory"] });
    void qc.invalidateQueries({ queryKey: ["teachers"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
    void qc.invalidateQueries({ queryKey: ["school-analytics"] });
  };

  const resetForm = () => {
    setFullName("");
    setType("teaching");
    setRoleTitle("");
    setPhone("");
    setEmail("");
    setHiredOn("");
    setStatus("active");
    setEditingId(null);
    setFormOpen(false);
  };

  const startEdit = (m: StaffMember) => {
    setEditingId(m.id);
    setFullName(m.fullName);
    setType(m.type);
    setRoleTitle(m.roleTitle ?? "");
    setPhone(m.phone ?? "");
    setEmail(m.email ?? "");
    setHiredOn(m.hiredOn ?? "");
    setStatus(m.status);
    setBulkOpen(false);
    setFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) {
        await updateStaffMember(editingId, {
          fullName,
          type,
          roleTitle,
          phone,
          email,
          hiredOn,
          status,
        });
      } else {
        await createStaffMember({
          fullName,
          type,
          roleTitle,
          phone,
          email,
          hiredOn,
          status,
        });
      }
    },
    onSuccess: () => {
      resetForm();
      invalidate();
    },
  });

  const handleBulkFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBulkFileError(null);
    setBulkSuccessCount(null);
    try {
      const parsed = await parseStaffSpreadsheet(file);
      if (parsed.length === 0) {
        setBulkFileError(
          "No valid staff rows found. Ensure your sheet has a 'Full Name' (or 'First Name' & 'Last Name') column.",
        );
      }
      setBulkRows(parsed);
    } catch (err) {
      setBulkFileError(
        err instanceof Error
          ? err.message
          : "Could not read that spreadsheet file.",
      );
    }
  };

  const bulkImportMutation = useMutation({
    mutationFn: () => bulkCreateStaff(bulkRows),
    onSuccess: (count) => {
      setBulkSuccessCount(count);
      setBulkRows([]);
      invalidate();
    },
  });

  const staff = staffQuery.data ?? [];

  const counts = useMemo(() => {
    const active = staff.filter((s) => s.status !== "left");
    const teaching = active.filter((s) => s.type === "teaching").length;
    const nonTeaching = active.filter((s) => s.type === "non_teaching").length;
    const onLeave = staff.filter((s) => s.status === "on_leave").length;
    return {
      totalActive: active.length,
      teaching,
      nonTeaching,
      onLeave,
    };
  }, [staff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (filter === "teaching" && (s.type !== "teaching" || s.status === "left"))
        return false;
      if (
        filter === "non_teaching" &&
        (s.type !== "non_teaching" || s.status === "left")
      )
        return false;
      if (filter === "on_leave" && s.status !== "on_leave") return false;
      if (filter === "left" && s.status !== "left") return false;
      if (filter === "all" && s.status === "left" && !q) return false;
      if (!q) return true;
      return (
        s.fullName.toLowerCase().includes(q) ||
        (s.staffNo && s.staffNo.toLowerCase().includes(q)) ||
        (s.roleTitle && s.roleTitle.toLowerCase().includes(q)) ||
        (s.phone && s.phone.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q))
      );
    });
  }, [staff, filter, search]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    saveMutation.mutate();
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Staff directory
          </h1>
          <p className="text-sm text-muted-foreground">
            Teaching and non-teaching staff records, contact details, and
            assignments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button
              type="button"
              variant={bulkOpen ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFormOpen(false);
                setBulkOpen((o) => !o);
              }}
            >
              <FileSpreadsheet className="size-4" aria-hidden />
              Bulk CSV / Excel Import
            </Button>
          ) : null}
          {isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/users/new">
                <UserRoundCog className="size-4" aria-hidden />
                Create login account
              </Link>
            </Button>
          ) : null}
          {canEdit && !formOpen ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                resetForm();
                setBulkOpen(false);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" aria-hidden />
              Add staff member
            </Button>
          ) : null}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="surface p-3.5">
          <div className="text-xs text-muted-foreground">Active staff</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {counts.totalActive}
          </div>
        </div>
        <div className="surface p-3.5">
          <div className="text-xs text-muted-foreground">Teaching</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-primary">
            {counts.teaching}
          </div>
        </div>
        <div className="surface p-3.5">
          <div className="text-xs text-muted-foreground">Non-teaching</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            {counts.nonTeaching}
          </div>
        </div>
        <div className="surface p-3.5">
          <div className="text-xs text-muted-foreground">On leave</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
            {counts.onLeave}
          </div>
        </div>
      </div>

      {/* Bulk CSV / Excel Import Panel */}
      {bulkOpen && canEdit ? (
        <section className="surface space-y-4 p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <FileSpreadsheet className="size-4 text-primary" aria-hidden />
                Bulk CSV / Excel Staff Import
              </h2>
              <p className="text-xs text-muted-foreground">
                Upload a `.csv` or `.xlsx` sheet to add multiple teachers and
                support staff at once with automatic `STF-NNNN` staff numbers.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setBulkOpen(false)}
              aria-label="Close bulk staff import"
              className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-foreground/[0.02] p-3.5">
            <span className="text-xs text-muted-foreground">
              Download a template or upload your existing staff spreadsheet:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadStaffImportTemplate("xlsx")}
              >
                <Download className="size-3.5" aria-hidden />
                Excel Template (.xlsx)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadStaffImportTemplate("csv")}
              >
                <Download className="size-3.5" aria-hidden />
                CSV Template (.csv)
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => void handleBulkFile(e)}
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

          {bulkFileError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {bulkFileError}
            </p>
          ) : null}

          {bulkSuccessCount !== null ? (
            <p
              role="status"
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"
            >
              Successfully imported {bulkSuccessCount} staff{" "}
              {bulkSuccessCount === 1 ? "member" : "members"}.
            </p>
          ) : null}

          {bulkRows.length > 0 ? (
            <div className="space-y-3">
              <div className="max-h-56 overflow-auto rounded-2xl border border-border">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-foreground/[0.03] uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pl-3 pr-2">Full Name</th>
                      <th className="py-2 px-2">Category</th>
                      <th className="py-2 px-2">Role Title</th>
                      <th className="py-2 px-2">Phone</th>
                      <th className="py-2 px-2">Email</th>
                      <th className="py-2 pl-2 pr-3 text-right"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {bulkRows.map((r, idx) => (
                      <tr key={idx}>
                        <td className="py-2 pl-3 pr-2 font-medium">
                          {r.fullName}
                        </td>
                        <td className="py-2 px-2">
                          {r.type === "teaching" ? "Teaching" : "Non-teaching"}
                        </td>
                        <td className="py-2 px-2">{r.roleTitle || "—"}</td>
                        <td className="py-2 px-2 tabular-nums">
                          {r.phone || "—"}
                        </td>
                        <td className="py-2 px-2">{r.email || "—"}</td>
                        <td className="py-2 pl-2 pr-3 text-right">
                          <button
                            type="button"
                            aria-label="Remove row"
                            onClick={() =>
                              setBulkRows((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
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
                  bulkImportMutation.isError
                    ? friendlyError(bulkImportMutation.error)
                    : null
                }
              />

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={bulkImportMutation.isPending}
                  onClick={() => bulkImportMutation.mutate()}
                >
                  <Check className="size-4" aria-hidden />
                  {bulkImportMutation.isPending
                    ? "Importing staff..."
                    : `Import ${bulkRows.length} staff ${bulkRows.length === 1 ? "member" : "members"}`}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Add / Edit Form */}
      {formOpen && canEdit ? (
        <form onSubmit={onSubmit} className="surface space-y-4 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Briefcase className="size-4 text-primary" aria-hidden />
            {editingId ? "Edit staff record" : "Add staff member"}
          </h2>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Full name" htmlFor="staff-name">
              <Input
                id="staff-name"
                placeholder="e.g. Ama Mensah"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </Field>
            <Field label="Category" htmlFor="staff-type">
              <NativeSelect
                id="staff-type"
                value={type}
                onChange={(e) => setType(e.target.value as StaffType)}
              >
                <option value="teaching">Teaching staff</option>
                <option value="non_teaching">Non-teaching / Support</option>
              </NativeSelect>
            </Field>
            <Field label="Role / Job title" htmlFor="staff-role">
              <Input
                id="staff-role"
                placeholder="e.g. Mathematics Teacher, Bursar"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Phone" htmlFor="staff-phone">
              <Input
                id="staff-phone"
                type="tel"
                placeholder="e.g. 024 000 0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="staff-email">
              <Input
                id="staff-email"
                type="email"
                placeholder="e.g. ama@school.edu.gh"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Hired on" htmlFor="staff-hired">
                <Input
                  id="staff-hired"
                  type="date"
                  value={hiredOn}
                  onChange={(e) => setHiredOn(e.target.value)}
                />
              </Field>
              <Field label="Status" htmlFor="staff-status">
                <NativeSelect
                  id="staff-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as StaffStatus)}
                >
                  <option value="active">Active</option>
                  <option value="on_leave">On leave</option>
                  <option value="left">Left</option>
                </NativeSelect>
              </Field>
            </div>
          </div>

          <FormMessage
            error={
              saveMutation.isError ? friendlyError(saveMutation.error) : null
            }
          />

          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={saveMutation.isPending || !fullName.trim()}
            >
              {saveMutation.isPending
                ? "Saving..."
                : editingId
                  ? "Save changes"
                  : "Add staff member"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {/* Filter pills & search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: "all", label: "Active" },
              { id: "teaching", label: "Teaching" },
              { id: "non_teaching", label: "Non-teaching" },
              { id: "on_leave", label: "On leave" },
              { id: "left", label: "Former / Left" },
            ] as { id: StaffFilter; label: string }[]
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-all",
                filter === item.id
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            placeholder="Search staff..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Staff list */}
      {staffQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filteredStaff.length === 0 ? (
        <section className="surface py-12 text-center">
          <UserCog
            className="mx-auto size-8 text-muted-foreground/60"
            aria-hidden
          />
          <p className="mt-2 text-sm font-medium">No staff records found</p>
        </section>
      ) : (
        <section className="surface overflow-x-auto p-4">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="pb-2.5 pr-3 font-medium">Staff Member</th>
                <th className="pb-2.5 px-2 font-medium">Category &amp; Role</th>
                <th className="pb-2.5 px-2 font-medium">Contact</th>
                <th className="pb-2.5 px-2 font-medium">Teaching Load</th>
                <th className="pb-2.5 px-2 font-medium">Status</th>
                {canEdit ? (
                  <th className="pb-2.5 pl-2 text-right font-medium"></th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredStaff.map((m) => {
                const badge = STATUS_BADGE[m.status];
                return (
                  <tr key={m.id}>
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-3">
                        <StudentAvatar
                          name={m.fullName}
                          className="size-9 shrink-0 text-xs"
                        />
                        <div>
                          <div className="font-medium">{m.fullName}</div>
                          <div className="text-xs tabular-nums text-muted-foreground">
                            {m.staffNo ?? "—"}
                            {m.profileId ? " · Login active" : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <div className="font-medium">
                        {m.roleTitle ||
                          (m.type === "teaching"
                            ? "Teacher"
                            : "Support Staff")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {m.type === "teaching" ? "Teaching" : "Non-teaching"}
                      </div>
                    </td>
                    <td className="py-3 px-2 text-xs text-muted-foreground">
                      {m.phone ? (
                        <div className="flex items-center gap-1">
                          <Phone className="size-3" aria-hidden />
                          <span>{m.phone}</span>
                        </div>
                      ) : null}
                      {m.email ? (
                        <div className="flex items-center gap-1">
                          <Mail className="size-3" aria-hidden />
                          <span>{m.email}</span>
                        </div>
                      ) : null}
                      {!m.phone && !m.email ? "—" : null}
                    </td>
                    <td className="py-3 px-2 text-xs tabular-nums text-muted-foreground">
                      {m.type === "teaching"
                        ? `${m.classesCount} ${m.classesCount === 1 ? "class" : "classes"} · ${m.subjectsCount} ${m.subjectsCount === 1 ? "subject" : "subjects"}`
                        : "—"}
                    </td>
                    <td className="py-3 px-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    {canEdit ? (
                      <td className="py-3 pl-2 text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit ${m.fullName}`}
                          onClick={() => startEdit(m)}
                          className="size-8"
                        >
                          <Edit3 className="size-4" aria-hidden />
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
