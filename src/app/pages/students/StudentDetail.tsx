import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText } from "lucide-react";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { hasAnyRole } from "../../../lib/permissions";
import {
  closeStudent, getStudent, removeStudentPhoto, reopenStudent, saveBeceIndex, updateStudent, uploadStudentPhoto,
  type StudentDetail, type StudentFields,
} from "../../../lib/data/students";
import { getStudentAttendance, type AttendanceStatus } from "../../../lib/data/attendance";
import { getStudentGradesOverview } from "../../../lib/data/grades";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { PhotoPicker } from "../../components/PhotoPicker";
import { StudentAvatar, usePhotoUrls } from "../../components/StudentAvatar";
import { DocumentFields, HealthFields, HistoryFields, PersonalFields } from "./fieldsets";
import { StatusPill } from "./StudentsList";
import { ChangeClassCard, DeleteStudentCard, GuardiansCard } from "./StudentManage";

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function age(dob: string): string | null {
  if (!dob) return null;
  const b = new Date(dob + "T00:00:00");
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a -= 1;
  return `${a} years`;
}

function PhotoCard({ s, url, canEdit }: { s: StudentDetail; url: string | undefined; canEdit: boolean }) {
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const name = [s.fields.firstName, s.fields.lastName].join(" ");
  const refresh = () => {
    setPhoto(null);
    void qc.invalidateQueries({ queryKey: ["student", s.id] });
    void qc.invalidateQueries({ queryKey: ["students"] });
    void qc.invalidateQueries({ queryKey: ["photo-urls"] });
  };
  const save = useMutation({ mutationFn: () => uploadStudentPhoto(s.id, photo!), onSuccess: refresh });
  const remove = useMutation({ mutationFn: () => removeStudentPhoto(s.id), onSuccess: refresh });

  if (!canEdit) return null;
  return (
    <section className="surface space-y-3 p-4">
      <h2 className="text-base font-medium">Photo</h2>
      <PhotoPicker name={name} existingUrl={url} value={photo} onChange={setPhoto} disabled={save.isPending || remove.isPending} />
      <FormMessage error={save.isError || remove.isError ? friendlyError(save.error ?? remove.error) : null} />
      <div className="flex gap-2">
        {photo ? <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save photo"}</Button> : null}
        {!photo && s.photoPath ? (
          <Button size="sm" variant="outline" disabled={remove.isPending} onClick={() => remove.mutate()}>Remove photo</Button>
        ) : null}
      </div>
    </section>
  );
}

const ATTENDANCE_BADGE: Record<AttendanceStatus, { label: string; className: string }> = {
  present: {
    label: "Present",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  late: {
    label: "Late",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  excused: {
    label: "Excused",
    className: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  absent: {
    label: "Absent",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

function AttendanceCard({ studentId }: { studentId: string }) {
  const q = useQuery({
    queryKey: ["student-attendance", studentId],
    queryFn: () => getStudentAttendance(studentId),
  });

  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  if (q.isError || !q.data) return null;

  const { present, late, excused, absent, total, recent } = q.data;
  const attended = present + late;
  const rate = total > 0 ? Math.round((attended / total) * 100) : null;

  return (
    <section className="surface space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-medium">Attendance</h2>
        {rate !== null ? (
          <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
            {rate}% attendance ({attended}/{total} days)
          </span>
        ) : null}
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">No attendance recorded yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-xl border border-border p-2">
              <div className="text-muted-foreground">Present</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {present}
              </div>
            </div>
            <div className="rounded-xl border border-border p-2">
              <div className="text-muted-foreground">Late</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                {late}
              </div>
            </div>
            <div className="rounded-xl border border-border p-2">
              <div className="text-muted-foreground">Excused</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-sky-600 dark:text-sky-400">
                {excused}
              </div>
            </div>
            <div className="rounded-xl border border-border p-2">
              <div className="text-muted-foreground">Absent</div>
              <div className="mt-0.5 text-base font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {absent}
              </div>
            </div>
          </div>

          {recent.length > 0 ? (
            <ul className="divide-y divide-border text-sm">
              {recent.slice(0, 5).map((r) => {
                const badge = ATTENDANCE_BADGE[r.status];
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <span className="tabular-nums font-medium">{r.date}</span>
                      {r.className ? (
                        <span className="text-xs text-muted-foreground"> · {r.className}</span>
                      ) : null}
                      {r.note ? (
                        <p className="text-xs text-muted-foreground">{r.note}</p>
                      ) : null}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

function GradesCard({ s }: { s: StudentDetail }) {
  const { roles } = useAuth();
  const canOpenGrades = hasAnyRole(roles, [
    "school_admin",
    "principal",
    "teacher",
    "parent",
    "student",
  ]);
  const q = useQuery({
    queryKey: ["student-grades-overview", s.id],
    queryFn: () => getStudentGradesOverview(s.id),
  });

  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  if (q.isError || !q.data) return null;

  const latest = q.data[0] ?? null;
  const currentClassId = latest?.classId ?? "";

  return (
    <section className="surface space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-medium">Grades &amp; Report cards</h2>
          {latest ? (
            <p className="text-xs text-muted-foreground">
              Latest: {latest.termName} ({latest.yearName}) · {latest.className}
            </p>
          ) : null}
        </div>
        {canOpenGrades && currentClassId ? (
          <Button asChild variant="outline" size="sm">
            <Link
              to={`/grades?class=${currentClassId}${latest ? `&term=${latest.termId}` : ""}&student=${s.id}&view=broadsheet`}
            >
              <FileText className="size-3.5" aria-hidden />
              Open report card
            </Link>
          </Button>
        ) : null}
      </div>

      {!latest ? (
        <p className="text-sm text-muted-foreground">
          No term results or remarks have been recorded yet.
        </p>
      ) : latest.results.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {latest.results.map((r) => (
            <li
              key={r.subjectId}
              className="flex items-center justify-between gap-2 py-2"
            >
              <span className="font-medium">{r.subjectName}</span>
              <span className="flex items-center gap-2 text-xs tabular-nums">
                <span className="text-muted-foreground">
                  CA {r.caTotal.toFixed(1)} · Exam {r.examScore.toFixed(1)}
                </span>
                <strong className="text-sm">{r.total.toFixed(1)}%</strong>
                {r.grade ? (
                  <span className="rounded-md bg-primary/15 px-1.5 py-0.5 font-bold text-primary">
                    {r.grade}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : latest.descriptiveRemarks.length > 0 ? (
        <ul className="divide-y divide-border text-sm">
          {latest.descriptiveRemarks.map((r) => (
            <li key={r.subjectId} className="space-y-0.5 py-2">
              <div className="font-medium">{r.subjectName}</div>
              <div className="text-xs text-muted-foreground">{r.remark}</div>
            </li>
          ))}
        </ul>
      ) : null}

      {latest?.overallRemark ? (
        <p className="rounded-xl border border-border/70 bg-foreground/[0.02] p-2.5 text-xs italic text-muted-foreground">
          Class teacher: {latest.overallRemark}
        </p>
      ) : null}
    </section>
  );
}

function DetailsForm({ s, canEdit }: { s: StudentDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const [f, setF] = useState<StudentFields>(s.fields);
  const patch = (p: Partial<StudentFields>) => setF((cur) => ({ ...cur, ...p }));
  const save = useMutation({
    mutationFn: () => updateStudent(s.id, f),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["student", s.id] });
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={!canEdit || save.isPending} className="space-y-4">
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Personal details</h2>
          <PersonalFields value={f} onChange={patch} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Date of admission" htmlFor="admitted"><Input id="admitted" type="date" max={today()} value={f.admittedOn} onChange={(e) => patch({ admittedOn: e.target.value })} /></Field>
            <Field label="Age" htmlFor="age"><Input id="age" value={age(f.dateOfBirth) ?? "Not recorded"} readOnly tabIndex={-1} /></Field>
          </div>
        </section>
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Health</h2>
          <HealthFields value={f} onChange={patch} />
        </section>
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">School history</h2>
          <HistoryFields value={f} onChange={patch} />
        </section>
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Documents and consent</h2>
          <DocumentFields value={f} onChange={patch} />
        </section>
      </fieldset>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} ok={save.isSuccess ? "Saved" : null} />
      {canEdit ? (
        <Button type="submit" disabled={save.isPending || !f.firstName.trim() || !f.lastName.trim() || !f.gender}>
          {save.isPending ? "Saving" : "Save changes"}
        </Button>
      ) : null}
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
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="surface space-y-3 p-4">
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
  const isDev = roles.includes("developer");
  const flash = location.state as { admitted?: string; photoFailed?: boolean } | null;

  const q = useQuery({ queryKey: ["student", id], queryFn: () => getStudent(id), enabled: !!id });
  const s = q.data;
  const urls = usePhotoUrls([s?.photoPath ? s.id : null]);
  const name = s ? [s.fields.firstName, s.fields.middleName, s.fields.lastName].filter(Boolean).join(" ") : "";

  return (
    <div className="max-w-3xl space-y-4">
      <Link to="/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Students
      </Link>

      {flash?.admitted ? (
        <div role="status" className="surface flex items-center gap-2 p-3 text-sm">
          <Check className="size-4 shrink-0 text-primary" aria-hidden />
          <span>
            Admitted. Admission number <strong className="tabular-nums">{flash.admitted}</strong>.
            {flash.photoFailed ? " The photo could not be uploaded; add it below." : ""}
          </span>
        </div>
      ) : null}

      {q.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {q.isError ? <p role="alert" className="text-sm text-destructive">This student could not be loaded.</p> : null}
      {q.isSuccess && !s ? <p className="text-sm text-muted-foreground">Student not found, or you do not have access.</p> : null}

      {s ? (
        <>
          <div className="flex flex-wrap items-center gap-4">
            <StudentAvatar name={name} url={s.photoPath ? urls[s.id] : null} className="size-16 text-lg" />
            <div className="min-w-0 flex-1">
              <h1 className="break-words text-2xl font-semibold">{name}</h1>
              <p className="text-sm tabular-nums text-muted-foreground">{s.admissionNo}{s.enrollments[0] ? ` · ${s.enrollments[0].className}` : ""}</p>
            </div>
            <StatusPill status={s.status} />
          </div>

          <PhotoCard s={s} url={s.photoPath ? urls[s.id] : undefined} canEdit={canEdit} />

          <AttendanceCard studentId={s.id} />

          <GradesCard s={s} />

          <GuardiansCard s={s} canEdit={canEdit} />

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

          {canEdit && s.status === "active" ? <ChangeClassCard s={s} /> : null}
          {s.enrollments[0]?.sitsBece ? <BeceCard s={s} canEdit={canEdit} /> : null}
          {canEdit ? <StatusCard s={s} /> : null}
          {isDev ? <DeleteStudentCard s={s} /> : null}
        </>
      ) : null}
    </div>
  );
}
