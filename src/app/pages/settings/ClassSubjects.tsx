// Subjects for one class: tick the ones this class takes and pick a teacher for
// each. A subject can start at a later level, so every class has its own list.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { FormMessage, NativeSelect } from "../../components/fields";
import {
  addClassSubjects, copyClassSubjects, listClassSubjects, listCopySources, listItems, removeClassSubject,
  setAllSubjectTeachers, setSubjectTeacher, type SchoolClass, type StaffOption,
} from "../../../lib/data/setup";
import { friendlyError } from "../../../lib/data/errors";

export default function ClassSubjects({ cls, teachers }: { cls: SchoolClass; teachers: StaffOption[] }) {
  const qc = useQueryClient();
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: () => listItems("subjects") });
  const assigned = useQuery({ queryKey: ["class-subjects", cls.id], queryFn: () => listClassSubjects(cls.id) });
  const sources = useQuery({
    queryKey: ["copy-sources", cls.levelId, cls.id],
    queryFn: () => listCopySources(cls.levelId, cls.id),
  });
  const [copyFrom, setCopyFrom] = useState("");

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["class-subjects", cls.id] });
    void qc.invalidateQueries({ queryKey: ["classes"] });
    void qc.invalidateQueries({ queryKey: ["copy-sources"] });
  };
  const add = useMutation({ mutationFn: (subjectId: string) => addClassSubjects(cls.id, [subjectId]), onSuccess: refresh });
  const remove = useMutation({ mutationFn: removeClassSubject, onSuccess: refresh });
  const teach = useMutation({
    mutationFn: ({ id, staffId }: { id: string; staffId: string | null }) => setSubjectTeacher(id, staffId),
    onSuccess: refresh,
  });
  const allTeach = useMutation({
    mutationFn: () => setAllSubjectTeachers(cls.id, cls.classTeacherId),
    onSuccess: refresh,
  });
  const copy = useMutation({
    mutationFn: () => copyClassSubjects(copyFrom, cls.id),
    onSuccess: () => { setCopyFrom(""); refresh(); },
  });

  const byId = new Map(assigned.data?.map((a) => [a.subjectId, a]));
  const busy = add.isPending || remove.isPending || teach.isPending || allTeach.isPending || copy.isPending;
  const error = add.error ?? remove.error ?? teach.error ?? allTeach.error ?? copy.error;

  // Active subjects, plus any already on this class that were later switched off.
  const visible = subjects.data?.filter((s) => s.isActive || byId.has(s.id)) ?? [];

  return (
    <div className="space-y-3 border-t border-border pt-3">
      {sources.data && sources.data.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1 space-y-1.5">
            <label htmlFor={`copy-${cls.id}`} className="text-sm font-medium">Copy subjects from</label>
            <NativeSelect id={`copy-${cls.id}`} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Choose a class</option>
              {sources.data.map((o) => (
                <option key={o.id} value={o.id}>{o.label}, {o.subjectCount} subjects</option>
              ))}
            </NativeSelect>
          </div>
          <Button size="sm" variant="outline" disabled={!copyFrom || busy} onClick={() => copy.mutate()}>
            Copy
          </Button>
        </div>
      ) : null}

      {cls.classTeacherId && (assigned.data?.length ?? 0) > 0 ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => allTeach.mutate()}>
          Class teacher teaches all
        </Button>
      ) : null}

      {subjects.isError || assigned.isError ? (
        <p role="alert" className="text-sm text-destructive">Could not load subjects.</p>
      ) : null}

      <ul className="divide-y divide-border rounded-md border border-border">
        {visible.map((s) => {
          const a = byId.get(s.id);
          return (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox
                id={`cs-${cls.id}-${s.id}`}
                checked={!!a}
                disabled={busy}
                aria-label={`${s.name} for ${cls.levelName} ${cls.section}`}
                onCheckedChange={(v) => (v ? add.mutate(s.id) : a && remove.mutate(a.id))}
              />
              <label htmlFor={`cs-${cls.id}-${s.id}`} className={`flex-1 text-sm ${s.isActive ? "" : "text-muted-foreground"}`}>
                {s.name}{s.isActive ? "" : " (switched off)"}
              </label>
              {a ? (
                <NativeSelect
                  aria-label={`Teacher for ${s.name}`}
                  className="h-9 w-44"
                  value={a.teacherId ?? ""}
                  disabled={busy}
                  onChange={(e) => teach.mutate({ id: a.id, staffId: e.target.value || null })}
                >
                  <option value="">No teacher</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </NativeSelect>
              ) : null}
            </li>
          );
        })}
      </ul>
      {visible.length === 0 && subjects.data ? (
        <p className="text-sm text-muted-foreground">Add subjects on the Subjects tab first.</p>
      ) : null}
      <FormMessage error={error ? friendlyError(error) : null} />
    </div>
  );
}
