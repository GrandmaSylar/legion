import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useDebounced } from "../../../lib/useDebounced";
import { listAcademicYears, listClasses } from "../../../lib/data/setup";
import { admitStudent, findGuardiansByPhone, type Gender } from "../../../lib/data/students";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

const RELATIONSHIPS = ["Mother", "Father", "Guardian", "Grandparent", "Sibling", "Other"];

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [classId, setClassId] = useState("");
  const [medical, setMedical] = useState("");

  const [gName, setGName] = useState("");
  const [gPhone, setGPhone] = useState("");
  const [gRel, setGRel] = useState("Mother");
  const [gEmail, setGEmail] = useState("");
  const [useExisting, setUseExisting] = useState<string | null>(null);

  const phone = useDebounced(gPhone, 350);
  const matches = useQuery({
    queryKey: ["guardian-by-phone", phone],
    queryFn: () => findGuardiansByPhone(phone),
    enabled: phone.replace(/\D/g, "").length >= 7,
  });
  const existing = matches.data?.find((m) => m.id === useExisting) ?? null;

  const admit = useMutation({
    mutationFn: admitStudent,
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ["students"] });
      void qc.invalidateQueries({ queryKey: ["classes"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/students/${res.studentId}`, { state: { admitted: res.admissionNo } });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!gender) return;
    admit.mutate({
      firstName: firstName.trim(), middleName: middleName.trim(), lastName: lastName.trim(),
      dateOfBirth: dob, gender, classId, medicalNotes: medical.trim(),
      existingGuardianId: useExisting,
      guardianName: existing ? "" : gName.trim(),
      guardianPhone: existing ? "" : gPhone,
      guardianRelationship: existing ? "" : gRel,
      guardianEmail: existing ? "" : gEmail.trim(),
    });
  };

  const noClasses = years.isSuccess && (!currentYear || (classes.isSuccess && classes.data.length === 0));
  const ready = firstName.trim() && lastName.trim() && gender && (existing || gName.trim());

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/students" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Students
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Add a student</h1>
        <p className="text-sm text-muted-foreground">
          The admission number is assigned automatically and stays with the student until they complete school or leave.
        </p>
      </div>

      {noClasses ? (
        <section className="surface p-4 text-sm" role="status">
          There is no current academic year with classes yet, so the student cannot be placed in a class. You can still add
          them now and place them later. An administrator sets up years and classes in Settings.
        </section>
      ) : null}

      <form onSubmit={submit} className="space-y-4">
        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Student</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="First name" htmlFor="first"><Input id="first" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="off" /></Field>
            <Field label="Middle name" htmlFor="middle"><Input id="middle" value={middleName} onChange={(e) => setMiddleName(e.target.value)} autoComplete="off" /></Field>
            <Field label="Last name" htmlFor="last"><Input id="last" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="off" /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Date of birth" htmlFor="dob"><Input id="dob" type="date" max={today()} value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
            <Field label="Gender" htmlFor="gender">
              <NativeSelect id="gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)} required>
                <option value="" disabled>Choose</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </NativeSelect>
            </Field>
            <Field label={`Class${currentYear ? ` (${currentYear.name})` : ""}`} htmlFor="class">
              <NativeSelect id="class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                <option value="">Place later</option>
                {classes.data?.map((c) => <option key={c.id} value={c.id}>{c.levelName} {c.section}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Medical notes (allergies, conditions)" htmlFor="medical">
            <Input id="medical" value={medical} onChange={(e) => setMedical(e.target.value)} autoComplete="off" />
          </Field>
        </section>

        <section className="surface space-y-4 p-4">
          <h2 className="text-base font-medium">Parent or guardian</h2>
          <Field label="Phone number" htmlFor="gphone">
            <Input id="gphone" type="tel" inputMode="tel" value={gPhone} onChange={(e) => { setGPhone(e.target.value); setUseExisting(null); }} placeholder="024 000 0000" autoComplete="off" />
          </Field>

          {matches.data && matches.data.length > 0 ? (
            <fieldset className="space-y-2 rounded-md border border-border p-3">
              <legend className="px-1 text-sm font-medium">This number is already registered</legend>
              {matches.data.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="guardian" checked={useExisting === m.id} onChange={() => setUseExisting(m.id)} />
                  Use {m.fullName}{m.relationship ? ` (${m.relationship})` : ""} (for a sibling)
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="guardian" checked={useExisting === null} onChange={() => setUseExisting(null)} />
                Add a different person with this number
              </label>
            </fieldset>
          ) : null}

          {!existing ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" htmlFor="gname"><Input id="gname" value={gName} onChange={(e) => setGName(e.target.value)} required autoComplete="off" /></Field>
              <Field label="Relationship" htmlFor="grel">
                <NativeSelect id="grel" value={gRel} onChange={(e) => setGRel(e.target.value)}>
                  {RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Email (optional)" htmlFor="gemail"><Input id="gemail" type="email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} autoComplete="off" /></Field>
            </div>
          ) : null}
        </section>

        <FormMessage error={admit.isError ? friendlyError(admit.error) : null} />
        <div className="flex gap-2">
          <Button type="submit" disabled={admit.isPending || !ready}>{admit.isPending ? "Saving" : "Admit student"}</Button>
          <Button type="button" variant="ghost" asChild><Link to="/students">Cancel</Link></Button>
        </div>
      </form>
    </div>
  );
}
