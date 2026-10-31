// The student's fields, grouped the way an admission form is. Used step by step
// when admitting and all together when editing, so both stay identical.
import {
  BLOOD_GROUPS, DOCUMENTS, RELIGIONS, TRANSPORT_MODES, type Gender, type StudentFields,
} from "../../../lib/data/students";
import { Input } from "../../components/ui/input";
import { Field, NativeSelect } from "../../components/fields";

interface Props {
  value: StudentFields;
  onChange: (patch: Partial<StudentFields>) => void;
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Check({
  id, checked, onChange, children,
}: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="flex items-start gap-2 text-sm">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--primary)]"
      />
      <span>{children}</span>
    </label>
  );
}

export function PersonalFields({ value: v, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="First name" htmlFor="first"><Input id="first" value={v.firstName} onChange={(e) => onChange({ firstName: e.target.value })} required autoComplete="off" /></Field>
        <Field label="Middle name" htmlFor="middle"><Input id="middle" value={v.middleName} onChange={(e) => onChange({ middleName: e.target.value })} autoComplete="off" /></Field>
        <Field label="Last name" htmlFor="last"><Input id="last" value={v.lastName} onChange={(e) => onChange({ lastName: e.target.value })} required autoComplete="off" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date of birth" htmlFor="dob"><Input id="dob" type="date" max={today()} value={v.dateOfBirth} onChange={(e) => onChange({ dateOfBirth: e.target.value })} required /></Field>
        <Field label="Gender" htmlFor="gender">
          <NativeSelect id="gender" value={v.gender} onChange={(e) => onChange({ gender: e.target.value as Gender })} required>
            <option value="" disabled>Choose</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </NativeSelect>
        </Field>
        <Field label="Place of birth" htmlFor="pob"><Input id="pob" value={v.placeOfBirth} onChange={(e) => onChange({ placeOfBirth: e.target.value })} autoComplete="off" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nationality" htmlFor="nat"><Input id="nat" value={v.nationality} onChange={(e) => onChange({ nationality: e.target.value })} autoComplete="off" /></Field>
        <Field label="Religion" htmlFor="religion">
          <NativeSelect id="religion" value={v.religion} onChange={(e) => onChange({ religion: e.target.value })}>
            <option value="">Not stated</option>
            {RELIGIONS.map((r) => <option key={r}>{r}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Language spoken at home" htmlFor="lang"><Input id="lang" value={v.homeLanguage} onChange={(e) => onChange({ homeLanguage: e.target.value })} placeholder="Twi, Ewe, Ga…" autoComplete="off" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Home address" htmlFor="addr"><Input id="addr" value={v.residenceAddress} onChange={(e) => onChange({ residenceAddress: e.target.value })} autoComplete="off" /></Field>
        <Field label="Birth certificate number" htmlFor="cert"><Input id="cert" value={v.birthCertNo} onChange={(e) => onChange({ birthCertNo: e.target.value })} autoComplete="off" /></Field>
      </div>
    </div>
  );
}

export function HealthFields({ value: v, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Blood group" htmlFor="blood">
          <NativeSelect id="blood" value={v.bloodGroup} onChange={(e) => onChange({ bloodGroup: e.target.value })}>
            <option value="">Not known</option>
            {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
          </NativeSelect>
        </Field>
        <Field label="NHIS number" htmlFor="nhis"><Input id="nhis" value={v.nhisNo} onChange={(e) => onChange({ nhisNo: e.target.value })} autoComplete="off" /></Field>
      </div>
      <Field label="Allergies" htmlFor="allergies"><Input id="allergies" value={v.allergies} onChange={(e) => onChange({ allergies: e.target.value })} placeholder="Food, medicine, insect stings…" autoComplete="off" /></Field>
      <Field label="Medical conditions" htmlFor="medical"><Input id="medical" value={v.medicalNotes} onChange={(e) => onChange({ medicalNotes: e.target.value })} placeholder="Asthma, sickle cell, epilepsy…" autoComplete="off" /></Field>
      <Field label="Special needs or support required" htmlFor="needs"><Input id="needs" value={v.specialNeeds} onChange={(e) => onChange({ specialNeeds: e.target.value })} autoComplete="off" /></Field>
      <Check id="consent-medical" checked={v.consentMedical} onChange={(c) => onChange({ consentMedical: c })}>
        The parent or guardian agrees that the school may arrange emergency medical treatment for the child if they cannot be reached.
      </Check>
    </div>
  );
}

export function HistoryFields({ value: v, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Previous school" htmlFor="prev-school"><Input id="prev-school" value={v.previousSchool} onChange={(e) => onChange({ previousSchool: e.target.value })} autoComplete="off" /></Field>
        <Field label="Last class attended" htmlFor="prev-class"><Input id="prev-class" value={v.previousClass} onChange={(e) => onChange({ previousClass: e.target.value })} autoComplete="off" /></Field>
      </div>
      <Field label="Reason for leaving" htmlFor="prev-reason"><Input id="prev-reason" value={v.previousSchoolReason} onChange={(e) => onChange({ previousSchoolReason: e.target.value })} autoComplete="off" /></Field>
      <Field label="How the child gets to school" htmlFor="transport">
        <NativeSelect id="transport" value={v.transportMode} onChange={(e) => onChange({ transportMode: e.target.value })} className="max-w-xs">
          <option value="">Not stated</option>
          {TRANSPORT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </NativeSelect>
      </Field>
    </div>
  );
}

export function DocumentFields({ value: v, onChange }: Props) {
  const toggle = (key: string, on: boolean) =>
    onChange({ documentsReceived: on ? [...v.documentsReceived, key] : v.documentsReceived.filter((d) => d !== key) });
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Documents received</legend>
        {DOCUMENTS.map((d) => (
          <Check key={d.value} id={`doc-${d.value}`} checked={v.documentsReceived.includes(d.value)} onChange={(on) => toggle(d.value, on)}>
            {d.label}
          </Check>
        ))}
      </fieldset>
      <Check id="consent-photo" checked={v.consentPhoto} onChange={(c) => onChange({ consentPhoto: c })}>
        The parent or guardian agrees that the school may use the child's photo in school records and, where appropriate, school publications.
      </Check>
    </div>
  );
}
