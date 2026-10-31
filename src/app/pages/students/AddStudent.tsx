// Admission as five short steps instead of one long form: student, health,
// family, school history and documents, then a review before anything is saved.
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useDebounced } from "../../../lib/useDebounced";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import {
  DOCUMENTS, RELATIONSHIPS, admitStudent, emptyGuardian, emptyStudentFields, findGuardiansByPhone,
  uploadStudentPhoto, type GuardianEntry, type StudentFields,
} from "../../../lib/data/students";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { PhotoPicker } from "../../components/PhotoPicker";
import { cn } from "../../components/ui/utils";
import { DocumentFields, HealthFields, HistoryFields, PersonalFields } from "./fieldsets";

const STEPS = ["Student", "Health", "Family", "School history", "Review"] as const;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CheckRow({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--primary)]" />
      {children}
    </label>
  );
}

function GuardianCard({
  index, g, onChange, onPrimary, onRemove, canRemove,
}: {
  index: number;
  g: GuardianEntry;
  onChange: (patch: Partial<GuardianEntry>) => void;
  onPrimary: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const phone = useDebounced(g.phone, 350);
  const matches = useQuery({
    queryKey: ["guardian-by-phone", phone],
    queryFn: () => findGuardiansByPhone(phone),
    enabled: !g.existingId && phone.replace(/\D/g, "").length >= 7,
  });
  const id = `g${index}`;

  return (
    <section className="surface space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium">Parent or guardian {index + 1}</h3>
        {canRemove ? (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden /> Remove
          </Button>
        ) : null}
      </div>

      {g.existingId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm">
          <span>Using <strong>{g.fullName}</strong>{g.relationship ? ` (${g.relationship})` : ""}, already registered with this number.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange({ existingId: null })}>Enter different details</Button>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone number" htmlFor={`${id}-phone`}>
              <Input id={`${id}-phone`} type="tel" inputMode="tel" value={g.phone} onChange={(e) => onChange({ phone: e.target.value })} placeholder="024 000 0000" autoComplete="off" />
            </Field>
            <Field label="Relationship" htmlFor={`${id}-rel`}>
              <NativeSelect id={`${id}-rel`} value={g.relationship} onChange={(e) => onChange({ relationship: e.target.value })}>
                {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
              </NativeSelect>
            </Field>
          </div>

          {matches.data && matches.data.length > 0 ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">This number is already registered</p>
              {matches.data.map((m) => (
                <Button
                  key={m.id} type="button" size="sm" variant="outline" className="mr-2"
                  onClick={() => onChange({ existingId: m.id, fullName: m.fullName, relationship: m.relationship ?? g.relationship, phone: m.phone ?? g.phone })}
                >
                  Use {m.fullName}{m.relationship ? ` (${m.relationship})` : ""} (a sibling's parent)
                </Button>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" htmlFor={`${id}-name`}><Input id={`${id}-name`} value={g.fullName} onChange={(e) => onChange({ fullName: e.target.value })} autoComplete="off" /></Field>
            <Field label="Email (optional)" htmlFor={`${id}-email`}><Input id={`${id}-email`} type="email" value={g.email} onChange={(e) => onChange({ email: e.target.value })} autoComplete="off" /></Field>
            <Field label="Occupation" htmlFor={`${id}-job`}><Input id={`${id}-job`} value={g.occupation} onChange={(e) => onChange({ occupation: e.target.value })} autoComplete="off" /></Field>
            <Field label="Employer" htmlFor={`${id}-employer`}><Input id={`${id}-employer`} value={g.employer} onChange={(e) => onChange({ employer: e.target.value })} autoComplete="off" /></Field>
          </div>
          <Field label="Address (if different from the child's)" htmlFor={`${id}-addr`}><Input id={`${id}-addr`} value={g.address} onChange={(e) => onChange({ address: e.target.value })} autoComplete="off" /></Field>
        </>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="primary-guardian" checked={g.isPrimary} onChange={onPrimary} className="size-4 accent-[var(--primary)]" />
          Main contact
        </label>
        <CheckRow id={`${id}-fees`} checked={g.isFeePayer} onChange={(v) => onChange({ isFeePayer: v })}>Pays the fees</CheckRow>
        <CheckRow id={`${id}-emergency`} checked={g.isEmergencyContact} onChange={(v) => onChange({ isEmergencyContact: v })}>Emergency contact</CheckRow>
        <CheckRow id={`${id}-pickup`} checked={g.canPickup} onChange={(v) => onChange({ canPickup: v })}>May collect the child</CheckRow>
      </div>
    </section>
  );
}

export default function AddStudent() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const currentYear = years.data?.find((y) => y.isCurrent) ?? null;
  const classes = useQuery({
    queryKey: ["classes", currentYear?.id],
    queryFn: () => listClasses(currentYear!.id),
    enabled: !!currentYear,
  });

  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<StudentFields>({ ...emptyStudentFields(), admittedOn: today() });
  const [classId, setClassId] = useState("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [guardians, setGuardians] = useState<GuardianEntry[]>([emptyGuardian("Mother", true)]);

  const patch = (p: Partial<StudentFields>) => setFields((f) => ({ ...f, ...p }));
  const patchGuardian = (i: number, p: Partial<GuardianEntry>) =>
    setGuardians((list) => list.map((g, k) => (k === i ? { ...g, ...p } : g)));
  const setPrimary = (i: number) => setGuardians((list) => list.map((g, k) => ({ ...g, isPrimary: k === i })));
  const removeGuardian = (i: number) =>
    setGuardians((list) => {
      const next = list.filter((_, k) => k !== i);
      if (next.length > 0 && !next.some((g) => g.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });

  const named = guardians.filter((g) => g.existingId || g.fullName.trim());
  const problems: string[][] = [
    [
      !fields.firstName.trim() || !fields.lastName.trim() ? "the student's first and last name" : "",
      !fields.gender ? "gender" : "",
      !fields.dateOfBirth ? "date of birth" : "",
    ].filter(Boolean),
    [],
    [
      named.length === 0 ? "at least one parent or guardian" : "",
      named.length > 0 && !named.some((g) => g.phone.trim() || g.existingId) ? "a phone number for a parent or guardian" : "",
    ].filter(Boolean),
    [],
    [],
  ];
  const missing = problems[step];

  const admit = useMutation({
    mutationFn: async () => {
      const res = await admitStudent(fields, classId, guardians);
      let photoFailed = false;
      if (photo) {
        try { await uploadStudentPhoto(res.studentId, photo); } catch { photoFailed = true; }
      }
      return { ...res, photoFailed };
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/students/${res.studentId}`, { state: { admitted: res.admissionNo, photoFailed: res.photoFailed } });
    },
  });

  const noClasses = years.isSuccess && (!currentYear || (classes.isSuccess && classes.data.length === 0));
  const className = classes.data?.find((c) => c.id === classId);
  const fullName = [fields.firstName, fields.middleName, fields.lastName].filter(Boolean).join(" ");

  return (
    <div className="max-w-2xl space-y-4">
      <Link to="/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Students
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Admit a student</h1>
        <p className="text-sm text-muted-foreground">
          The admission number is assigned automatically and stays with the student until they complete school or leave.
        </p>
      </div>

      {/* Phones: one line and a progress bar. Larger screens: the five steps. */}
      <div className="md:hidden" role="status">
        <p className="text-sm font-medium">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>
      <ol className="hidden gap-1 md:flex" aria-label="Admission steps">
        {STEPS.map((name, i) => (
          <li key={name} aria-current={i === step ? "step" : undefined} className="flex-1">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={cn(
                "w-full whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors",
                i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/15 text-primary" : "bg-foreground/5 text-muted-foreground",
              )}
            >
              {i + 1}. {name}
            </button>
          </li>
        ))}
      </ol>

      {noClasses && step === 0 ? (
        <section className="surface p-4 text-sm" role="status">
          There is no current academic year with classes yet, so the student cannot be placed in a class. You can still admit
          them now and place them later. An administrator sets up years and classes in Settings.
        </section>
      ) : null}

      {step === 0 ? (
        <section className="surface space-y-5 p-4">
          <PhotoPicker name={fullName} value={photo} onChange={setPhoto} disabled={admit.isPending} />
          <PersonalFields value={fields} onChange={patch} />
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <Field label={`Class${currentYear ? ` (${currentYear.name})` : ""}`} htmlFor="class">
              <NativeSelect id="class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Place later</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.levelName} {c.section}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Date of admission" htmlFor="admitted"><Input id="admitted" type="date" max={today()} value={fields.admittedOn} onChange={(e) => patch({ admittedOn: e.target.value })} /></Field>
          </div>
        </section>
      ) : null}

      {step === 1 ? <section className="surface p-4"><HealthFields value={fields} onChange={patch} /></section> : null}

      {step === 2 ? (
        <div className="space-y-3">
          {guardians.map((g, i) => (
            <GuardianCard
              key={i} index={i} g={g}
              onChange={(p) => patchGuardian(i, p)}
              onPrimary={() => setPrimary(i)}
              onRemove={() => removeGuardian(i)}
              canRemove={guardians.length > 1}
            />
          ))}
          <Button type="button" variant="outline" onClick={() => setGuardians((l) => [...l, emptyGuardian(l.length === 1 ? "Father" : "Guardian")])}>
            <Plus className="size-4" aria-hidden /> Add another person
          </Button>
        </div>
      ) : null}

      {step === 3 ? (
        <section className="surface space-y-6 p-4">
          <HistoryFields value={fields} onChange={patch} />
          <div className="border-t border-border pt-4"><DocumentFields value={fields} onChange={patch} /></div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Check the details</h2>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Student</dt><dd className="font-medium">{fullName}</dd></div>
            <div><dt className="text-muted-foreground">Date of birth</dt><dd>{fields.dateOfBirth}</dd></div>
            <div><dt className="text-muted-foreground">Gender</dt><dd className="capitalize">{fields.gender}</dd></div>
            <div><dt className="text-muted-foreground">Class</dt><dd>{className ? `${className.levelName} ${className.section}` : "Place later"}</dd></div>
            <div><dt className="text-muted-foreground">Parents and guardians</dt><dd>{named.map((g) => g.fullName || "Existing guardian").join(", ")}</dd></div>
            <div><dt className="text-muted-foreground">Documents received</dt><dd>{fields.documentsReceived.length} of {DOCUMENTS.length}</dd></div>
            <div><dt className="text-muted-foreground">Medical consent</dt><dd>{fields.consentMedical ? "Given" : "Not given"}</dd></div>
            <div><dt className="text-muted-foreground">Photo consent</dt><dd>{fields.consentPhoto ? "Given" : "Not given"}</dd></div>
          </dl>
          <FormMessage error={admit.isError ? friendlyError(admit.error) : null} />
        </section>
      ) : null}

      {step < 4 && missing.length > 0 ? (
        <p role="status" className="text-sm text-muted-foreground">To continue, add {missing.join(" and ")}.</p>
      ) : null}

      <div className="flex gap-2">
        {step > 0 ? <Button type="button" variant="outline" disabled={admit.isPending} onClick={() => setStep(step - 1)}>Back</Button> : null}
        {step < 4 ? (
          <Button type="button" disabled={missing.length > 0} onClick={() => setStep(step + 1)}>Continue</Button>
        ) : (
          <Button type="button" disabled={admit.isPending} onClick={() => admit.mutate()}>
            {admit.isPending ? "Saving" : "Admit student"}
          </Button>
        )}
        <Button type="button" variant="ghost" asChild><Link to="/students">Cancel</Link></Button>
      </div>
    </div>
  );
}
