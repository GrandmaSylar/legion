import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check } from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import {
  closeStudent, getStudent, reopenStudent, saveBeceIndex, updateStudent, type Gender, type StudentDetail,
} from "../../../lib/data/students";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { StatusPill } from "./StudentsList";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function age(dob: string | null): string | null {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00");
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return `${a} years`;
}

function DetailsForm({ s, canEdit }: { s: StudentDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const [first, setFirst] = useState(s.firstName);
  const [middle, setMiddle] = useState(s.middleName);
  const [last, setLast] = useState(s.lastName);
  const [dob, setDob] = useState(s.dateOfBirth ?? "");
  const [gender, setGender] = useState<Gender>(s.gender ?? "female");
  const [medical, setMedical] = useState(s.medicalNotes);
  const save = useMutation({
    mutationFn: () =>
      updateStudent(s.id, {
        firstName: first.trim(), middleName: middle.trim(), lastName: last.trim(),
        dateOfBirth: dob, gender, medicalNotes: medical.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["student", s.id] });
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <form onSubmit={submit} className="surface space-y-4 p-4">
      <h2 className="text-base font-medium">Details</h2>
      <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="First name" htmlFor="first"><Input id="first" value={first} onChange={(e) => setFirst(e.target.value)} required /></Field>
          <Field label="Middle name" htmlFor="middle"><Input id="middle" value={middle} onChange={(e) => setMiddle(e.target.value)} /></Field>
          <Field label="Last name" htmlFor="last"><Input id="last" value={last} onChange={(e) => setLast(e.target.value)} required /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date of birth" htmlFor="dob"><Input id="dob" type="date" max={today()} value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
          <Field label="Gender" htmlFor="gender">
            <NativeSelect id="gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </NativeSelect>
          </Field>
          <Field label="Age" htmlFor="age"><Input id="age" value={age(dob) ?? "Not recorded"} readOnly tabIndex={-1} /></Field>
        </div>
        <Field label="Medical notes" htmlFor="medical"><Input id="medical" value={medical} onChange={(e) => setMedical(e.target.value)} /></Field>
      </fieldset>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} ok={save.isSuccess ? "Saved" : null} />
      {canEdit ? <Button type="submit" disabled={save.isPending || !first.trim() || !last.trim()}>{save.isPending ? "Saving" : "Save changes"}</Button> : null}
    </form>
  );
}

function BeceCard({ s, canEdit }: { s: StudentDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const examYear = new Date().getFullYear();
  const current = s.bece.find((b) => b.examYear === examYear);
  const [value, setValue] = useState(current?.indexNumber ?? "");
  useEffect(() => setValue(current?.indexNumber ?? ""), [current?.indexNumber]);
  const save = useMutation({
    mutationFn: () => saveBeceIndex(s.id, examYear, value.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["student", s.id] }),
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
      className="surface space-y-3 p-4"
    >
      <h2 className="text-base font-medium">BECE {examYear}</h2>
      <p className="text-sm text-muted-foreground">The school enters the index number once it has been issued.</p>
      <Field label="Index number" htmlFor="bece">
        <Input id="bece" value={value} onChange={(e) => setValue(e.target.value)} disabled={!canEdit} inputMode="numeric" autoComplete="off" />
      </Field>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} ok={save.isSuccess ? "Saved" : null} />
      {canEdit ? <Button type="submit" size="sm" disabled={save.isPending}>Save index number</Button> : null}
    </form>
  );
}

function StatusCard({ s }: { s: StudentDetail }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"completed" | "left">("left");
  const [on, setOn] = useState(today());
  const [reason, setReason] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["student", s.id] });
    void qc.invalidateQueries({ queryKey: ["students"] });
    void qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const close = useMutation({ mutationFn: () => closeStudent(s.id, kind, on, reason.trim()), onSuccess: refresh });
  const reopen = useMutation({ mutationFn: () => reopenStudent(s.id), onSuccess: refresh });

  if (s.status !== "active") {
    return (
      <section className="surface space-y-3 p-4">
        <h2 className="text-base font-medium">{s.status === "completed" ? "Completed school" : "Left the school"}</h2>
        <p className="text-sm text-muted-foreground">
          {s.leftOn ? `On ${s.leftOn}. ` : ""}{s.leftReason ?? ""} The admission number {s.admissionNo} stays with this student and is never reused.
        </p>
        <FormMessage error={reopen.isError ? friendlyError(reopen.error) : null} />
        <Button variant="outline" size="sm" disabled={reopen.isPending} onClick={() => reopen.mutate()}>Mark as active again</Button>
      </section>
    );
  }
  return (
    <section className="surface space-y-3 p-4">
      <h2 className="text-base font-medium">Completed or left</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What happened" htmlFor="close-kind">
          <NativeSelect id="close-kind" value={kind} onChange={(e) => setKind(e.target.value as "completed" | "left")}>
            <option value="left">Left the school</option>
            <option value="completed">Completed school</option>
          </NativeSelect>
        </Field>
        <Field label="Date" htmlFor="close-on"><Input id="close-on" type="date" max={today()} value={on} onChange={(e) => setOn(e.target.value)} /></Field>
      </div>
      <Field label="Reason (optional)" htmlFor="close-reason"><Input id="close-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <FormMessage error={close.isError ? friendlyError(close.error) : null} />
      <Button variant="outline" size="sm" disabled={close.isPending || !on} onClick={() => close.mutate()}>Record</Button>
    </section>
  );
}

export default function StudentDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const { roles } = useAuth();
  const canEdit = hasAnyRole(roles, ["school_admin", "receptionist"]);
  const admitted = (location.state as { admitted?: string } | null)?.admitted;

  const q = useQuery({ queryKey: ["student", id], queryFn: () => getStudent(id), enabled: !!id });
  const s = q.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Students
      </Link>

      {admitted ? (
        <div role="status" className="surface flex items-center gap-2 p-3 text-sm">
          <Check className="size-4 text-primary" aria-hidden />
          Admitted. Admission number <strong className="tabular-nums">{admitted}</strong>.
        </div>
      ) : null}

      {q.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {q.isError ? <p role="alert" className="text-sm text-destructive">This student could not be loaded.</p> : null}
      {q.isSuccess && !s ? <p className="text-sm text-muted-foreground">Student not found, or you do not have access.</p> : null}

      {s ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-semibold">{[s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")}</h1>
              <p className="text-sm tabular-nums text-muted-foreground">{s.admissionNo}</p>
            </div>
            <StatusPill status={s.status} />
          </div>

          <DetailsForm key={s.id} s={s} canEdit={canEdit} />

          <section className="surface space-y-2 p-4">
            <h2 className="text-base font-medium">Classes</h2>
            {s.enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not placed in a class yet.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {s.enrollments.map((e) => (
                  <li key={e.id} className="flex justify-between py-2"><span>{e.className}</span><span className="text-muted-foreground">{e.yearName}</span></li>
                ))}
              </ul>
            )}
          </section>

          <section className="surface space-y-2 p-4">
            <h2 className="text-base font-medium">Parents and guardians</h2>
            {s.guardians.length === 0 ? (
              <p className="text-sm text-muted-foreground">No guardian recorded.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {s.guardians.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{g.fullName}{g.relationship ? ` (${g.relationship})` : ""}{g.isPrimary ? " · primary" : ""}</span>
                    {g.phone ? <a href={`tel:${g.phone}`} className="tabular-nums text-primary underline-offset-4 hover:underline">{g.phone}</a> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {s.enrollments[0]?.sitsBece ? <BeceCard s={s} canEdit={canEdit} /> : null}
          {canEdit ? <StatusCard s={s} /> : null}
        </>
      ) : null}
    </div>
  );
}
