// Controls on an existing student: change class, manage parents and guardians,
// and (developer only) delete a mistaken record.
import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useDebounced } from "../../../lib/useDebounced";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import {
  RELATIONSHIPS, addStudentGuardian, changeStudentClass, deleteStudent, emptyGuardian, findGuardiansByPhone,
  removeStudentGuardian, updateStudentGuardian, type GuardianEntry, type StudentDetail,
} from "../../../lib/data/students";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DeleteButton } from "../../components/DeleteButton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

type Guardian = StudentDetail["guardians"][number];

function useRefreshStudent(studentId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["student", studentId] });
    void qc.invalidateQueries({ queryKey: ["students"] });
    void qc.invalidateQueries({ queryKey: ["classes"] });
  };
}

// ─── Change class ────────────────────────────────────────────────────────────

export function ChangeClassCard({ s }: { s: StudentDetail }) {
  const refresh = useRefreshStudent(s.id);
  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const year = years.data?.find((y) => y.isCurrent) ?? null;
  const classes = useQuery({ queryKey: ["classes", year?.id], queryFn: () => listClasses(year!.id), enabled: !!year });
  const [classId, setClassId] = useState("");
  const move = useMutation({ mutationFn: () => changeStudentClass(s.id, classId), onSuccess: () => { setClassId(""); refresh(); } });

  return (
    <section className="surface space-y-3 p-4">
      <h2 className="text-base font-medium">Class{year ? ` for ${year.name}` : ""}</h2>
      {!year ? (
        <p className="text-sm text-muted-foreground">There is no current academic year to place the student in.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Field label="Move to" htmlFor="move-class">
              <NativeSelect id="move-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Choose a class</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.levelName} {c.section}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Button size="sm" disabled={!classId || move.isPending} onClick={() => move.mutate()}>{move.isPending ? "Moving" : "Move"}</Button>
        </div>
      )}
      <FormMessage error={move.isError ? friendlyError(move.error) : null} />
    </section>
  );
}

// ─── Guardians ───────────────────────────────────────────────────────────────

function toEntry(g: Guardian): GuardianEntry {
  return {
    existingId: g.id, fullName: g.fullName, relationship: g.relationship ?? "Guardian", phone: g.phone ?? "",
    email: g.email ?? "", occupation: g.occupation ?? "", employer: g.employer ?? "", address: g.address ?? "",
    isPrimary: g.isPrimary, isFeePayer: g.isFeePayer, isEmergencyContact: g.isEmergencyContact, canPickup: g.canPickup,
  };
}

function Flag({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  );
}

function GuardianForm({
  idPrefix, initial, editingExisting, pending, error, submitLabel, onSubmit, onCancel,
}: {
  idPrefix: string;
  initial: GuardianEntry;
  editingExisting: boolean;
  pending: boolean;
  error: string | null;
  submitLabel: string;
  onSubmit: (g: GuardianEntry) => void;
  onCancel: () => void;
}) {
  const [g, setG] = useState(initial);
  const patch = (p: Partial<GuardianEntry>) => setG((cur) => ({ ...cur, ...p }));
  const phone = useDebounced(g.phone, 350);
  const matches = useQuery({
    queryKey: ["guardian-by-phone", phone],
    queryFn: () => findGuardiansByPhone(phone),
    enabled: !editingExisting && !g.existingId && phone.replace(/\D/g, "").length >= 7,
  });
  const id = (k: string) => `${idPrefix}-${k}`;

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(g); }}
      className="space-y-3 rounded-md border border-border p-3"
    >
      {g.existingId && !editingExisting ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>Using <strong>{g.fullName}</strong>, already registered.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => patch({ existingId: null })}>Enter different details</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone" htmlFor={id("phone")}><Input id={id("phone")} type="tel" value={g.phone} onChange={(e) => patch({ phone: e.target.value })} autoComplete="off" /></Field>
            <Field label="Relationship" htmlFor={id("rel")}>
              <NativeSelect id={id("rel")} value={g.relationship} onChange={(e) => patch({ relationship: e.target.value })}>
                {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
              </NativeSelect>
            </Field>
          </div>
          {matches.data && matches.data.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Already registered:</span>
              {matches.data.map((m) => (
                <Button key={m.id} type="button" size="sm" variant="outline" onClick={() => patch({ existingId: m.id, fullName: m.fullName, phone: m.phone ?? g.phone })}>
                  Use {m.fullName}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor={id("name")}><Input id={id("name")} value={g.fullName} onChange={(e) => patch({ fullName: e.target.value })} required autoComplete="off" /></Field>
            <Field label="Email" htmlFor={id("email")}><Input id={id("email")} type="email" value={g.email} onChange={(e) => patch({ email: e.target.value })} autoComplete="off" /></Field>
            <Field label="Occupation" htmlFor={id("job")}><Input id={id("job")} value={g.occupation} onChange={(e) => patch({ occupation: e.target.value })} autoComplete="off" /></Field>
            <Field label="Employer" htmlFor={id("employer")}><Input id={id("employer")} value={g.employer} onChange={(e) => patch({ employer: e.target.value })} autoComplete="off" /></Field>
          </div>
          <Field label="Address" htmlFor={id("addr")}><Input id={id("addr")} value={g.address} onChange={(e) => patch({ address: e.target.value })} autoComplete="off" /></Field>
        </>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Flag id={id("primary")} checked={g.isPrimary} onChange={(v) => patch({ isPrimary: v })}>Main contact</Flag>
        <Flag id={id("fees")} checked={g.isFeePayer} onChange={(v) => patch({ isFeePayer: v })}>Pays the fees</Flag>
        <Flag id={id("emergency")} checked={g.isEmergencyContact} onChange={(v) => patch({ isEmergencyContact: v })}>Emergency contact</Flag>
        <Flag id={id("pickup")} checked={g.canPickup} onChange={(v) => patch({ canPickup: v })}>May collect the child</Flag>
      </div>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || (!g.existingId && !g.fullName.trim())}>{pending ? "Saving" : submitLabel}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

function GuardianRow({ s, g, canEdit }: { s: StudentDetail; g: Guardian; canEdit: boolean }) {
  const refresh = useRefreshStudent(s.id);
  const [editing, setEditing] = useState(false);
  const save = useMutation({ mutationFn: (e: GuardianEntry) => updateStudentGuardian(s.id, g.id, e), onSuccess: () => { setEditing(false); refresh(); } });
  const remove = useMutation({ mutationFn: () => removeStudentGuardian(s.id, g.id), onSuccess: refresh });

  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{g.fullName}{g.relationship ? ` (${g.relationship})` : ""}</span>
        <span className="flex flex-wrap items-center gap-1">
          {g.phone ? <a href={`tel:${g.phone}`} className="mr-2 text-sm tabular-nums text-primary underline-offset-4 hover:underline">{g.phone}</a> : null}
          {canEdit ? (
            <>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>Edit</Button>
              <DeleteButton
                label="Remove" what={`${g.fullName} from this student`} pending={remove.isPending}
                error={remove.isError ? friendlyError(remove.error) : null} onConfirm={() => remove.mutate()}
              />
            </>
          ) : null}
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {[g.isPrimary && "Main contact", g.isFeePayer && "Pays fees", g.isEmergencyContact && "Emergency contact", !g.canPickup && "May not collect", g.occupation].filter(Boolean).join(" · ")}
      </div>
      {editing ? (
        <GuardianForm
          idPrefix={`g-${g.id}`} initial={toEntry(g)} editingExisting pending={save.isPending}
          error={save.isError ? friendlyError(save.error) : null} submitLabel="Save"
          onSubmit={(e) => save.mutate(e)} onCancel={() => setEditing(false)}
        />
      ) : null}
    </li>
  );
}

export function GuardiansCard({ s, canEdit }: { s: StudentDetail; canEdit: boolean }) {
  const refresh = useRefreshStudent(s.id);
  const [adding, setAdding] = useState(false);
  const add = useMutation({ mutationFn: (g: GuardianEntry) => addStudentGuardian(s.id, g), onSuccess: () => { setAdding(false); refresh(); } });

  return (
    <section className="surface space-y-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Parents and guardians</h2>
        {canEdit && !adding ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden /> Add</Button>
        ) : null}
      </div>
      {s.guardians.length === 0 ? (
        <p className="text-sm text-muted-foreground">No guardian recorded.</p>
      ) : (
        <ul className="divide-y divide-border">
          {s.guardians.map((g) => <GuardianRow key={g.id} s={s} g={g} canEdit={canEdit} />)}
        </ul>
      )}
      {adding ? (
        <GuardianForm
          idPrefix="g-new" initial={emptyGuardian("Guardian")} editingExisting={false} pending={add.isPending}
          error={add.isError ? friendlyError(add.error) : null} submitLabel="Add"
          onSubmit={(g) => add.mutate(g)} onCancel={() => setAdding(false)}
        />
      ) : null}
    </section>
  );
}

// ─── Delete (developer only) ─────────────────────────────────────────────────

export function DeleteStudentCard({ s }: { s: StudentDetail }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => deleteStudent(s.id, s.photoPath),
    onSuccess: () => {
      for (const key of ["students", "classes", "dashboard"]) void qc.invalidateQueries({ queryKey: [key] });
      navigate("/students", { replace: true });
    },
  });
  const name = [s.fields.firstName, s.fields.lastName].join(" ");
  return (
    <section className="surface space-y-2 p-4">
      <h2 className="text-base font-medium text-destructive">Delete this student</h2>
      <p className="text-sm text-muted-foreground">
        For mistakes such as a test or duplicate admission. It only works if the student has no attendance, grades or
        billing. Otherwise mark them as left or completed above. The admission number {s.admissionNo} will not be reused.
      </p>
      <DeleteButton
        what={name} pending={del.isPending} onConfirm={() => del.mutate()}
        error={del.isError ? friendlyError(del.error) : null}
      />
    </section>
  );
}
