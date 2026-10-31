import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import ClassSubjects from "./ClassSubjects";
import { ClassActions } from "./rowActions";
import {
  createClass, listAcademicYears, listClasses, listLevels, listTeachers, setClassTeacher,
} from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";

export default function ClassesTab() {
  const qc = useQueryClient();
  const years = useQuery({ queryKey: ["academic-years"], queryFn: listAcademicYears });
  const levels = useQuery({ queryKey: ["levels"], queryFn: listLevels, staleTime: 5 * 60_000 });
  const teachers = useQuery({ queryKey: ["teachers"], queryFn: listTeachers });

  const [yearId, setYearId] = useState("");
  useEffect(() => {
    if (!yearId && years.data?.length) {
      setYearId((years.data.find((y) => y.isCurrent) ?? years.data[0]).id);
    }
  }, [years.data, yearId]);

  const classes = useQuery({
    queryKey: ["classes", yearId],
    queryFn: () => listClasses(yearId),
    enabled: !!yearId,
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: ["classes"] });

  const [openId, setOpenId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState("");
  const [section, setSection] = useState("A");
  const [teacherId, setTeacherId] = useState("");
  const add = useMutation({
    mutationFn: createClass,
    onSuccess: () => { setSection("A"); setTeacherId(""); refresh(); },
  });
  const addAll = useMutation({
    mutationFn: async () => {
      for (const l of levels.data ?? []) {
        await createClass({ levelId: l.id, academicYearId: yearId, section: "A", classTeacherId: null });
      }
    },
    onSuccess: refresh,
  });
  const assign = useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string | null }) => setClassTeacher(id, staffId),
    onSuccess: refresh,
  });

  if (years.data?.length === 0) {
    return (
      <section className="surface p-6">
        <h3 className="text-base font-medium">Add an academic year first</h3>
        <p className="mt-1 text-sm text-muted-foreground">Classes belong to a year. Use the Academic year tab.</p>
      </section>
    );
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({
      levelId, academicYearId: yearId, section: section.trim(), classTeacherId: teacherId || null,
    });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Field label="Academic year" htmlFor="classes-year">
          <NativeSelect id="classes-year" value={yearId} onChange={(e) => setYearId(e.target.value)} className="max-w-xs">
            {years.data?.map((y) => (
              <option key={y.id} value={y.id}>{y.name}{y.isCurrent ? " (current)" : ""}</option>
            ))}
          </NativeSelect>
        </Field>

        {classes.isError ? (
          <p role="alert" className="text-sm text-destructive">Could not load classes.</p>
        ) : null}

        {classes.data && classes.data.length === 0 ? (
          <section className="surface space-y-3 p-6">
            <h3 className="text-base font-medium">No classes in this year yet</h3>
            <p className="text-sm text-muted-foreground">
              Create one class (section A) for every level in one go, then add or rename sections as needed.
            </p>
            <Button onClick={() => addAll.mutate()} disabled={addAll.isPending || !levels.data?.length}>
              {addAll.isPending ? "Creating" : `Create section A for all ${levels.data?.length ?? ""} levels`}
            </Button>
            <FormMessage error={addAll.isError ? friendlyError(addAll.error) : null} />
          </section>
        ) : null}

        {classes.data && classes.data.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {classes.data.map((c) => (
              <li key={c.id} className={`surface space-y-2 p-4 ${openId === c.id ? "sm:col-span-full" : ""}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-base font-medium">{c.levelName} {c.section}</h3>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {c.studentCount} {c.studentCount === 1 ? "student" : "students"}
                  </span>
                </div>
                <ClassActions cls={c} />
                <Field label="Class teacher" htmlFor={`teacher-${c.id}`}>
                  <NativeSelect
                    id={`teacher-${c.id}`}
                    value={c.classTeacherId ?? ""}
                    disabled={assign.isPending}
                    onChange={(e) => assign.mutate({ id: c.id, staffId: e.target.value || null })}
                  >
                    <option value="">Not assigned</option>
                    {teachers.data?.map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <button
                  type="button"
                  aria-expanded={openId === c.id}
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                  className="flex w-full items-center justify-between rounded-md px-1 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                >
                  <span>
                    Subjects{" "}
                    <span className="font-normal text-muted-foreground">
                      {c.subjectCount === 0 ? "none yet" : c.subjectCount}
                    </span>
                  </span>
                  <ChevronDown className={`size-4 transition-transform ${openId === c.id ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {openId === c.id ? <ClassSubjects cls={c} teachers={teachers.data ?? []} /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {assign.isError ? <FormMessage error={friendlyError(assign.error)} /> : null}
      </div>

      <form onSubmit={submit} className="surface h-fit space-y-4 p-4">
        <h3 className="text-base font-medium">Add a class</h3>
        <Field label="Level" htmlFor="class-level">
          <NativeSelect id="class-level" value={levelId} onChange={(e) => setLevelId(e.target.value)} required>
            <option value="" disabled>Choose a level</option>
            {levels.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Section" htmlFor="class-section">
          <Input id="class-section" value={section} onChange={(e) => setSection(e.target.value)} placeholder="A" required />
        </Field>
        <Field label="Class teacher (optional)" htmlFor="class-teacher">
          <NativeSelect id="class-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Not assigned</option>
            {teachers.data?.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
          </NativeSelect>
        </Field>
        {teachers.data?.length === 0 ? (
          <p className="text-xs text-muted-foreground">No teachers yet. Add staff first to assign one.</p>
        ) : null}
        <FormMessage error={add.isError ? friendlyError(add.error) : null} />
        <Button type="submit" disabled={add.isPending || !levelId || !section.trim() || !yearId}>
          {add.isPending ? "Adding" : "Add class"}
        </Button>
      </form>
    </div>
  );
}
