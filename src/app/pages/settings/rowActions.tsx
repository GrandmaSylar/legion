// Edit (admin and developer) and delete (developer only) controls for the rows
// on the Academic year and Classes tabs.
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../lib/auth/AuthProvider";
import {
  deleteAcademicYear, deleteClass, deleteTerm, updateAcademicYear, updateClassSection, updateTerm,
  type AcademicYear, type SchoolClass, type Term,
} from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { DeleteButton } from "../../components/DeleteButton";
import { Field, FormMessage } from "../../components/fields";

function useIsDeveloper(): boolean {
  return useAuth().roles.includes("developer");
}

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    for (const key of ["academic-years", "terms", "classes", "students", "dashboard"]) {
      void qc.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** Name and date range, used for both a year and a term. */
function DatedForm({
  id, initial, minDate, maxDate, pending, error, onSubmit, onCancel,
}: {
  id: string;
  initial: { name: string; startDate: string; endDate: string };
  minDate?: string;
  maxDate?: string;
  pending: boolean;
  error: string | null;
  onSubmit: (v: { name: string; startDate: string; endDate: string }) => void;
  onCancel: () => void;
}) {
  const [v, setV] = useState(initial);
  const submit = (e: FormEvent) => { e.preventDefault(); onSubmit({ ...v, name: v.name.trim() }); };
  return (
    <form onSubmit={submit} className="basis-full space-y-3 rounded-md border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor={`${id}-n`}><Input id={`${id}-n`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required /></Field>
        <Field label="Starts" htmlFor={`${id}-s`}><Input id={`${id}-s`} type="date" min={minDate} max={maxDate} value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} required /></Field>
        <Field label="Ends" htmlFor={`${id}-e`}><Input id={`${id}-e`} type="date" min={v.startDate || minDate} max={maxDate} value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} required /></Field>
      </div>
      <FormMessage error={error} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !v.name.trim() || !v.startDate || !v.endDate}>{pending ? "Saving" : "Save"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}

export function YearActions({ year, lead }: { year: AcademicYear; lead?: string }) {
  const isDev = useIsDeveloper();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const save = useMutation({ mutationFn: (v: { name: string; startDate: string; endDate: string }) => updateAcademicYear(year.id, v), onSuccess: () => { setEditing(false); refresh(); } });
  const del = useMutation({ mutationFn: () => deleteAcademicYear(year.id), onSuccess: refresh });
  return (
    <>
      <Button type="button" size="sm" variant="ghost" className={lead} onClick={() => setEditing((e) => !e)}>Edit</Button>
      {isDev ? <DeleteButton what={`the year ${year.name}`} pending={del.isPending} error={del.isError ? friendlyError(del.error) : null} onConfirm={() => del.mutate()} /> : null}
      {editing ? (
        <DatedForm
          id={`year-${year.id}`} initial={{ name: year.name, startDate: year.startDate, endDate: year.endDate }}
          pending={save.isPending} error={save.isError ? friendlyError(save.error) : null}
          onSubmit={(v) => save.mutate(v)} onCancel={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

export function TermActions({ term, year, lead }: { term: Term; year: AcademicYear; lead?: string }) {
  const isDev = useIsDeveloper();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const save = useMutation({ mutationFn: (v: { name: string; startDate: string; endDate: string }) => updateTerm(term.id, v), onSuccess: () => { setEditing(false); refresh(); } });
  const del = useMutation({ mutationFn: () => deleteTerm(term.id), onSuccess: refresh });
  return (
    <>
      <Button type="button" size="sm" variant="ghost" className={lead} onClick={() => setEditing((e) => !e)}>Edit</Button>
      {isDev ? <DeleteButton what={term.name} pending={del.isPending} error={del.isError ? friendlyError(del.error) : null} onConfirm={() => del.mutate()} /> : null}
      {editing ? (
        <DatedForm
          id={`term-${term.id}`} initial={{ name: term.name, startDate: term.startDate, endDate: term.endDate }}
          minDate={year.startDate} maxDate={year.endDate}
          pending={save.isPending} error={save.isError ? friendlyError(save.error) : null}
          onSubmit={(v) => save.mutate(v)} onCancel={() => setEditing(false)}
        />
      ) : null}
    </>
  );
}

export function ClassActions({ cls }: { cls: SchoolClass }) {
  const isDev = useIsDeveloper();
  const refresh = useRefresh();
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState(cls.section);
  const save = useMutation({ mutationFn: () => updateClassSection(cls.id, section.trim()), onSuccess: () => { setEditing(false); refresh(); } });
  const del = useMutation({ mutationFn: () => deleteClass(cls.id), onSuccess: refresh });
  return (
    <div className="flex flex-wrap items-center gap-1">
      {editing ? (
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="flex items-center gap-2">
          <Input aria-label="Section name" value={section} onChange={(e) => setSection(e.target.value)} className="h-8 w-24" autoFocus />
          <Button type="submit" size="sm" disabled={save.isPending || !section.trim()}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setSection(cls.section); }}>Cancel</Button>
        </form>
      ) : (
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>Rename section</Button>
      )}
      {isDev ? <DeleteButton what={`${cls.levelName} ${cls.section}`} pending={del.isPending} error={del.isError ? friendlyError(del.error) : null} onConfirm={() => del.mutate()} /> : null}
      {save.isError ? <span role="alert" className="basis-full text-sm text-destructive">{friendlyError(save.error)}</span> : null}
    </div>
  );
}
