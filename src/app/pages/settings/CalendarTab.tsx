import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { CurrentBadge, Field, FormMessage } from "../../components/fields";
import {
  createAcademicYear, createTerm, listAcademicYears, listTerms, setCurrentAcademicYear, setCurrentTerm,
  type AcademicYear,
} from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";
import { TermActions, YearActions } from "./rowActions";

function fmt(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function YearForm() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const m = useMutation({
    mutationFn: createAcademicYear,
    onSuccess: () => {
      setName(""); setStart(""); setEnd("");
      void qc.invalidateQueries({ queryKey: ["academic-years"] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate({ name: name.trim(), startDate: start, endDate: end });
  };
  return (
    <form onSubmit={submit} className="surface space-y-4 p-4">
      <h3 className="text-base font-medium">Add an academic year</h3>
      <Field label="Name" htmlFor="year-name">
        <Input id="year-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="2026/2027" required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts" htmlFor="year-start">
          <Input id="year-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="Ends" htmlFor="year-end">
          <Input id="year-end" type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
      </div>
      <FormMessage error={m.isError ? friendlyError(m.error) : null} />
      <Button type="submit" disabled={m.isPending || !name.trim() || !start || !end}>
        {m.isPending ? "Adding" : "Add year"}
      </Button>
    </form>
  );
}

function TermForm({ year }: { year: AcademicYear }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const m = useMutation({
    mutationFn: createTerm,
    onSuccess: () => {
      setName(""); setStart(""); setEnd("");
      void qc.invalidateQueries({ queryKey: ["terms"] });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    m.mutate({ academicYearId: year.id, name: name.trim(), startDate: start, endDate: end });
  };
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
      <h4 className="text-sm font-medium">Add a term to {year.name}</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" htmlFor={`term-name-${year.id}`}>
          <Input id={`term-name-${year.id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Term 1" required />
        </Field>
        <Field label="Starts" htmlFor={`term-start-${year.id}`}>
          <Input id={`term-start-${year.id}`} type="date" value={start} min={year.startDate} max={year.endDate} onChange={(e) => setStart(e.target.value)} required />
        </Field>
        <Field label="Ends" htmlFor={`term-end-${year.id}`}>
          <Input id={`term-end-${year.id}`} type="date" value={end} min={start || year.startDate} max={year.endDate} onChange={(e) => setEnd(e.target.value)} required />
        </Field>
      </div>
      <FormMessage error={m.isError ? friendlyError(m.error) : null} />
      <Button type="submit" size="sm" disabled={m.isPending || !name.trim() || !start || !end}>
        {m.isPending ? "Adding" : "Add term"}
      </Button>
    </form>
  );
}

export default function CalendarTab() {
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const terms = useQuery({ queryKey: ["terms"], queryFn: listTerms });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["academic-years"] });
    void qc.invalidateQueries({ queryKey: ["terms"] });
    void qc.invalidateQueries({ queryKey: ["classes"] });
  };
  const makeYearCurrent = useMutation({ mutationFn: setCurrentAcademicYear, onSuccess: refresh });
  const makeTermCurrent = useMutation({ mutationFn: setCurrentTerm, onSuccess: refresh });

  if (years.isError || terms.isError) {
    return <p role="alert" className="text-sm text-destructive">Could not load the academic calendar.</p>;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        {years.data?.length === 0 ? (
          <section className="surface p-6">
            <h3 className="text-base font-medium">Start with an academic year</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Add the current year first, then its terms. Classes, attendance and grades all hang off these.
            </p>
          </section>
        ) : null}

        {years.data?.map((year) => {
          const yearTerms = terms.data?.filter((t) => t.academicYearId === year.id) ?? [];
          return (
            <section key={year.id} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-medium">{year.name}</h3>
                {year.isCurrent ? <CurrentBadge /> : null}
                <span className="text-sm text-muted-foreground">
                  {fmt(year.startDate)} to {fmt(year.endDate)}
                </span>
                <YearActions year={year} lead="ml-auto" />
                {!year.isCurrent ? (
                  <Button
                    size="sm" variant="outline"
                    disabled={makeYearCurrent.isPending}
                    onClick={() => makeYearCurrent.mutate(year.id)}
                  >
                    Make current
                  </Button>
                ) : null}
              </div>

              {yearTerms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No terms yet.</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {yearTerms.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="font-medium">{t.name}</span>
                      {t.isCurrent ? <CurrentBadge /> : null}
                      <span className="text-muted-foreground">{fmt(t.startDate)} to {fmt(t.endDate)}</span>
                      <TermActions term={t} year={year} lead="ml-auto" />
                      {!t.isCurrent ? (
                        <Button
                          size="sm" variant="ghost"
                          disabled={makeTermCurrent.isPending}
                          onClick={() => makeTermCurrent.mutate(t.id)}
                        >
                          Make current
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              <TermForm year={year} />
            </section>
          );
        })}
        {makeYearCurrent.isError || makeTermCurrent.isError ? (
          <FormMessage error={friendlyError(makeYearCurrent.error ?? makeTermCurrent.error)} />
        ) : null}
      </div>

      <YearForm />
    </div>
  );
}
