import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { listLevels, listSubjects } from "../../../lib/data/setup";
import {
  TEMPLATE_COLUMNS, deleteTopic, importTopics, listTopics, readSyllabusFile, saveTopic, swapTopics, type ImportRow, type Topic,
} from "../../../lib/data/lessons";
import { downloadTable } from "../../../lib/export/tableExport";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

function TopicDialog({ topic, subjectId, levelId, nextPosition, onClose }: { topic: Topic | "new" | null; subjectId: string; levelId: string; nextPosition: number; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = topic && topic !== "new" ? topic : null;
  const [f, setF] = useState({ title: existing?.title ?? "", termNo: existing?.termNo ? String(existing.termNo) : "", weekNo: existing?.weekNo ? String(existing.weekNo) : "", objectives: existing?.objectives ?? "" });
  const save = useMutation({
    mutationFn: () => saveTopic({ id: existing?.id, subjectId, levelId, position: nextPosition, ...f }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["syllabus-topics"] }); onClose(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (f.title.trim()) save.mutate(); };
  return (
    <Dialog open={topic !== null} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        {topic !== null ? (
          <form onSubmit={submit} className="space-y-4" key={existing?.id ?? "new"}>
            <DialogHeader><DialogTitle>{existing ? "Change topic" : "Add a topic"}</DialogTitle><DialogDescription>A topic teachers can plan against.</DialogDescription></DialogHeader>
            <Field label="Topic" htmlFor="st-title"><Input id="st-title" value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} required autoFocus /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Term (optional)" htmlFor="st-term">
                <NativeSelect id="st-term" value={f.termNo} onChange={(e) => setF({ ...f, termNo: e.target.value })}><option value="">Any</option><option value="1">Term 1</option><option value="2">Term 2</option><option value="3">Term 3</option></NativeSelect>
              </Field>
              <Field label="Week (optional)" htmlFor="st-week"><Input id="st-week" type="number" min="1" max="20" inputMode="numeric" value={f.weekNo} onChange={(e) => setF({ ...f, weekNo: e.target.value })} /></Field>
            </div>
            <Field label="Objectives (optional)" htmlFor="st-obj"><Textarea id="st-obj" rows={3} value={f.objectives} maxLength={1000} onChange={(e) => setF({ ...f, objectives: e.target.value })} /></Field>
            <FormMessage error={save.isError ? friendlyError(save.error) : null} />
            <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={save.isPending || !f.title.trim()}>{save.isPending ? "Saving" : "Save"}</Button></DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** The syllabus for a subject at a level: typed in, or imported from an Excel or CSV file. */
export function SyllabusTab() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const canManage = can("lessons.manage_syllabus");
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: listSubjects, staleTime: 5 * 60_000 });
  const levels = useQuery({ queryKey: ["levels"], queryFn: listLevels, staleTime: 5 * 60_000 });
  const topics = useQuery({ queryKey: ["syllabus-topics"], queryFn: listTopics, staleTime: 15_000 });
  const [subjectId, setSubjectId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [editing, setEditing] = useState<Topic | "new" | null>(null);
  const subject = subjectId || subjects.data?.[0]?.id || "";
  const level = levelId || levels.data?.[0]?.id || "";
  const list = useMemo(() => (topics.data ?? []).filter((t) => t.subjectId === subject && t.levelId === level).sort((a, b) => a.position - b.position), [topics.data, subject, level]);
  const nextPosition = (list[list.length - 1]?.position ?? 0) + 1;

  const refresh = () => void qc.invalidateQueries({ queryKey: ["syllabus-topics"] });
  const remove = useMutation({ mutationFn: (id: string) => deleteTopic(id), onSuccess: refresh });
  const swap = useMutation({ mutationFn: (v: { a: Topic; b: Topic }) => swapTopics(v.a, v.b), onSuccess: refresh });

  // Import
  const fileRef = useRef<HTMLInputElement>(null);
  const [found, setFound] = useState<{ rows: ImportRow[]; skipped: number; name: string } | null>(null);
  const [replace, setReplace] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const imp = useMutation({
    mutationFn: () => importTopics(subject, level, found!.rows, replace),
    onSuccess: () => { refresh(); setFound(null); if (fileRef.current) fileRef.current.value = ""; },
  });
  const onFile = async (file: File | undefined) => {
    setReadError(null); setFound(null);
    if (!file) return;
    try { const r = await readSyllabusFile(file); if (r.rows.length === 0) setReadError("No topics were found in that file."); else setFound({ ...r, name: file.name }); }
    catch (e) { setReadError(e instanceof Error ? e.message : "That file could not be read."); }
  };

  const nameOf = (arr: { id: string; name: string }[] | undefined, id: string) => arr?.find((x) => x.id === id)?.name ?? "";
  const grouped = [1, 2, 3, 0].map((t) => ({ term: t, items: list.filter((x) => (x.termNo ?? 0) === t) })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="surface grid gap-3 p-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="sy-subject"><NativeSelect id="sy-subject" value={subject} onChange={(e) => setSubjectId(e.target.value)}>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="Level" htmlFor="sy-level"><NativeSelect id="sy-level" value={level} onChange={(e) => setLevelId(e.target.value)}>{(levels.data ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</NativeSelect></Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs tabular-nums text-muted-foreground">{list.length} {list.length === 1 ? "topic" : "topics"}</p>
        <div className="flex flex-wrap gap-2">
          {can("lessons.download") ? (
            <DownloadMenu action="lessons.download" label="Download" disabled={list.length === 0} getTable={() => ({
              title: `Syllabus: ${nameOf(subjects.data, subject)}, ${nameOf(levels.data, level)}`, filename: "syllabus", columns: ["Term", "Week", "Topic", "Objectives"],
              rows: list.map((t) => [t.termNo ?? "", t.weekNo ?? "", t.title, t.objectives ?? ""]),
            })} />
          ) : null}
          {canManage ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => void downloadTable({ title: "Syllabus template", filename: "syllabus-template", columns: TEMPLATE_COLUMNS, rows: [[1, 1, "Counting in tens", "Count forwards and backwards in tens"], [1, 2, "Adding fractions", ""]] }, "xlsx")}>
                <FileSpreadsheet className="size-4" aria-hidden /> Template
              </Button>
              <Button type="button" size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add topic</Button>
            </>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <section className="surface space-y-3 p-4" aria-label="Import a syllabus">
          <div>
            <h3 className="text-sm font-semibold">Import from Excel or CSV</h3>
            <p className="text-xs text-muted-foreground">Fill in the template (a Topic column is needed; Term, Week and Objectives are optional) and import it into the subject and level chosen above.</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" aria-label="Syllabus file" onChange={(e) => void onFile(e.target.files?.[0])} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-1.5" />
          {readError ? <p role="alert" className="text-sm text-destructive">{readError}</p> : null}
          {found ? (
            <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
              <p><strong>{found.rows.length}</strong> {found.rows.length === 1 ? "topic" : "topics"} found in {found.name}{found.skipped ? `, ${found.skipped} rows skipped for having no topic` : ""}. They will go into <strong>{nameOf(subjects.data, subject)}, {nameOf(levels.data, level)}</strong>.</p>
              <label className="flex min-h-10 items-center gap-3"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={replace} onChange={(e) => setReplace(e.target.checked)} />Replace the {list.length} topics already there</label>
              <FormMessage error={imp.isError ? friendlyError(imp.error) : null} />
              <div className="flex gap-2"><Button type="button" size="sm" disabled={imp.isPending} onClick={() => imp.mutate()}>{imp.isPending ? "Importing" : "Import"}</Button><Button type="button" size="sm" variant="ghost" onClick={() => { setFound(null); if (fileRef.current) fileRef.current.value = ""; }}>Cancel</Button></div>
            </div>
          ) : null}
          {imp.isSuccess && !found ? <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{imp.data} {imp.data === 1 ? "topic was" : "topics were"} imported.</p> : null}
        </section>
      ) : null}

      {topics.isLoading ? <Skeleton className="h-24 w-full" /> : null}
      {topics.data && list.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">No topics for this subject and level yet.{canManage ? " Add one, or import a file." : ""}</p> : null}
      <FormMessage error={remove.isError ? friendlyError(remove.error) : swap.isError ? friendlyError(swap.error) : null} />
      {grouped.map((g) => (
        <section key={g.term} className="space-y-2" aria-label={g.term ? `Term ${g.term}` : "Any term"}>
          <h3 className="text-sm font-semibold">{g.term ? `Term ${g.term}` : "Any term"}</h3>
          <ul className="grid gap-2">
            {g.items.map((t) => {
              const i = list.findIndex((x) => x.id === t.id);
              return (
                <li key={t.id} className="surface flex items-start justify-between gap-2 p-3">
                  <button type="button" disabled={!canManage} onClick={() => setEditing(t)} className="min-w-0 text-left disabled:cursor-default">
                    <span className="block break-words text-sm font-medium">{t.weekNo ? <span className="mr-2 text-xs font-normal text-muted-foreground">Week {t.weekNo}</span> : null}{t.title}</span>
                    {t.objectives ? <span className="block break-words text-xs text-muted-foreground">{t.objectives}</span> : null}
                  </button>
                  {canManage ? (
                    <span className="flex shrink-0">
                      <Button type="button" size="icon" variant="ghost" aria-label={`Move ${t.title} up`} disabled={i === 0 || swap.isPending} onClick={() => swap.mutate({ a: t, b: list[i - 1] })}><ArrowUp className="size-4" aria-hidden /></Button>
                      <Button type="button" size="icon" variant="ghost" aria-label={`Move ${t.title} down`} disabled={i === list.length - 1 || swap.isPending} onClick={() => swap.mutate({ a: t, b: list[i + 1] })}><ArrowDown className="size-4" aria-hidden /></Button>
                      <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${t.title}`} disabled={remove.isPending} onClick={() => remove.mutate(t.id)}><Trash2 className="size-4" aria-hidden /></Button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <TopicDialog topic={editing} subjectId={subject} levelId={level} nextPosition={nextPosition} onClose={() => setEditing(null)} />
    </div>
  );
}
