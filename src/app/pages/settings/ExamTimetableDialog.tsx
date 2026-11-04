import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, UserRoundCheck } from "lucide-react";
import { listClasses, listTerms } from "../../../lib/data/setup";
import {
  assignInvigilators, deletePaper, getPeriodWeights, getTimetable, listClassSubjects, savePaper, setTimetablePublished, type Paper,
} from "../../../lib/data/examTimetable";
import { listAssignableStaff } from "../../../lib/data/tasks";
import { listExamPeriods, type ExamPeriod } from "../../../lib/data/examPeriods";
import { byDay, clashWith, dayText, durationText, hm, timeRange } from "../../../lib/examTimetable";
import { friendlyError } from "../../../lib/data/errors";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { useFeatures } from "../../../lib/access/useFeatures";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";

function PaperForm({ period, paper, papers, onClose }: { period: ExamPeriod; paper: Paper | null; papers: Paper[]; onClose: () => void }) {
  const qc = useQueryClient();
  const terms = useQuery({ queryKey: ["terms"], queryFn: listTerms, staleTime: 5 * 60_000 });
  const yearId = terms.data?.find((t) => t.id === period.termId)?.academicYearId;
  const classes = useQuery({ queryKey: ["classes", yearId], queryFn: () => listClasses(yearId!), enabled: !!yearId, staleTime: 5 * 60_000 });
  const mine = useMemo(() => (classes.data ?? [])
    .filter((c) => period.allClasses || period.classIds.includes(c.id))
    .map((c) => ({ id: c.id, label: `${c.levelName} ${c.section}`, order: c.levelOrder, section: c.section }))
    .sort((a, b) => a.order - b.order || a.section.localeCompare(b.section)), [classes.data, period]);
  const [classId, setClassId] = useState(paper?.classId ?? "");
  const cls = classId || mine[0]?.id || "";
  const subjects = useQuery({ queryKey: ["class-subjects", cls], queryFn: () => listClassSubjects(cls), enabled: !!cls, staleTime: 60_000 });
  const [subjectId, setSubjectId] = useState(paper?.subjectId ?? "");
  const [date, setDate] = useState(paper?.examDate ?? period.startsOn);
  const [start, setStart] = useState(paper ? hm(paper.startsAt) : "09:00");
  const [end, setEnd] = useState(paper ? hm(paper.endsAt) : "10:30");
  const [room, setRoom] = useState(paper?.room ?? "");
  const [notes, setNotes] = useState(paper?.notes ?? "");
  const subject = subjectId && subjects.data?.some((s) => s.id === subjectId) ? subjectId : subjects.data?.[0]?.id ?? "";
  const label = mine.find((c) => c.id === cls)?.label ?? "";
  const clash = label ? clashWith(papers, { id: paper?.id, classLabel: label, examDate: date, startsAt: start, endsAt: end }) : null;
  const save = useMutation({
    mutationFn: () => savePaper({ id: paper?.id, periodId: period.id, classId: cls, subjectId: subject, examDate: date, startsAt: start, endsAt: end, room, notes }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["exam-timetable", period.id] }); void qc.invalidateQueries({ queryKey: ["exam-timetable-periods"] }); onClose(); },
  });
  const problem = !cls ? "Choose a class." : !subject ? "That class has no subjects yet." : end <= start ? "The paper must end after it starts." : clash ? `${label} already has ${clash.subjectName} from ${timeRange(clash)} that day.` : null;
  const submit = (e: FormEvent) => { e.preventDefault(); if (!problem) save.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader><DialogTitle>{paper ? "Change paper" : "Add a paper"}</DialogTitle><DialogDescription>{period.name}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Class" htmlFor="pp-class"><NativeSelect id="pp-class" value={cls} disabled={!!paper} onChange={(e) => { setClassId(e.target.value); setSubjectId(""); }}>{mine.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</NativeSelect></Field>
        <Field label="Subject" htmlFor="pp-subject"><NativeSelect id="pp-subject" value={subject} disabled={!!paper} onChange={(e) => setSubjectId(e.target.value)}>{(subjects.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</NativeSelect></Field>
        <Field label="Day" htmlFor="pp-date"><Input id="pp-date" type="date" value={date} min={period.startsOn} max={period.endsOn} onChange={(e) => setDate(e.target.value)} required /></Field>
        <Field label="Room (optional)" htmlFor="pp-room"><Input id="pp-room" value={room} maxLength={60} placeholder="e.g. Hall" onChange={(e) => setRoom(e.target.value)} /></Field>
        <Field label="Starts" htmlFor="pp-start"><Input id="pp-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} required /></Field>
        <Field label="Ends" htmlFor="pp-end"><Input id="pp-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required /></Field>
      </div>
      <Field label="Note (optional)" htmlFor="pp-notes"><Input id="pp-notes" value={notes} maxLength={200} placeholder="e.g. Bring a calculator" onChange={(e) => setNotes(e.target.value)} /></Field>
      <FormMessage error={problem ?? (save.isError ? friendlyError(save.error) : null)} />
      <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={save.isPending || !!problem}>{save.isPending ? "Saving" : "Save paper"}</Button></DialogFooter>
    </form>
  );
}

function Invigilators({ paper, onClose }: { paper: Paper; onClose: () => void }) {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ["assignable-staff"], queryFn: listAssignableStaff, staleTime: 5 * 60_000, retry: false });
  const [picked, setPicked] = useState<string[]>(paper.invigilatorIds ?? []);
  const save = useMutation({ mutationFn: () => assignInvigilators(paper.id, picked), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["exam-timetable"] }); void qc.invalidateQueries({ queryKey: ["tasks"] }); onClose(); } });
  return (
    <div className="space-y-4">
      <DialogHeader><DialogTitle>Invigilators</DialogTitle><DialogDescription>{paper.subjectName}, {paper.classLabel} · {dayText(paper.examDate)}, {timeRange(paper)}. They are given an invigilation duty in Tasks.</DialogDescription></DialogHeader>
      {staff.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {staff.isError ? <p role="alert" className="text-sm">{friendlyError(staff.error)}</p> : null}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {(staff.data ?? []).map((s) => (
          <li key={s.id}><label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((x) => x !== s.id))} />{s.name}</label></li>
        ))}
      </ul>
      <FormMessage error={save.isError ? friendlyError(save.error) : null} />
      <DialogFooter className="gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : picked.length === 0 ? "Remove the duty" : "Save"}</Button></DialogFooter>
    </div>
  );
}

/** Build an exam period's timetable: papers by class and subject, invigilators, and publishing. */
export function ExamTimetableDialog({ period, open, onClose }: { period: ExamPeriod; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const { isOn } = useFeatures();
  const papersQ = useQuery({ queryKey: ["exam-timetable", period.id], queryFn: () => getTimetable(period.id), enabled: open });
  const weights = useQuery({ queryKey: ["exam-weights", period.id], queryFn: () => getPeriodWeights(period.id), enabled: open, retry: false });
  const [editing, setEditing] = useState<Paper | "new" | null>(null);
  const [invig, setInvig] = useState<Paper | null>(null);
  const papers = papersQ.data ?? [];
  const remove = useMutation({ mutationFn: (id: string) => deletePaper(id), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["exam-timetable", period.id] }); void qc.invalidateQueries({ queryKey: ["exam-timetable-periods"] }); } });
  const publish = useMutation({
    mutationFn: (on: boolean) => setTimetablePublished(period.id, on),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["exam-periods"] }); void qc.invalidateQueries({ queryKey: ["exam-timetable-periods"] }); },
  });
  const canInvigilate = can("tasks.assign") && isOn("tasks");
  const days = byDay(papers);
  const live = useQuery({ queryKey: ["exam-periods"], queryFn: listExamPeriods, enabled: open, staleTime: 5_000 }).data?.find((p) => p.id === period.id);
  const published = live?.timetablePublished ?? period.timetablePublished;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        {invig ? <Invigilators paper={invig} onClose={() => setInvig(null)} /> : editing !== null ? (
          <PaperForm key={editing === "new" ? "new" : editing.id} period={period} paper={editing === "new" ? null : editing} papers={papers} onClose={() => setEditing(null)} />
        ) : (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Exam timetable: {period.name}</DialogTitle>
              <DialogDescription>{published ? "Published. Parents and pupils of these classes can see it." : "A draft. Only people who set up exam periods can see it until you publish it."}</DialogDescription>
            </DialogHeader>
            {(weights.data ?? []).length > 0 ? (
              <p className="rounded-xl bg-foreground/5 p-3 text-xs text-muted-foreground">Counts toward the term result: {(weights.data ?? []).map((w) => `${w.part} (${w.weight}%) in ${w.scheme}`).join("; ")}.</p>
            ) : <p className="text-xs text-muted-foreground">No assessment scheme ties a part to this kind of exam, so its marks count as the teacher chooses. You can tie one under Settings, How marks add up.</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setEditing("new")}><Plus className="size-4" aria-hidden /> Add a paper</Button>
              <DownloadMenu action="calendar.download" label="Download" disabled={papers.length === 0} getTable={() => ({
                title: `Exam timetable: ${period.name}`, filename: `exam-timetable-${period.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
                columns: ["Day", "Starts", "Ends", "Class", "Subject", "Room", "Invigilators"],
                rows: [...papers].sort((a, b) => a.examDate.localeCompare(b.examDate) || a.startsAt.localeCompare(b.startsAt)).map((p) => [dayText(p.examDate), hm(p.startsAt), hm(p.endsAt), p.classLabel, p.subjectName, p.room ?? "", p.invigilatorNames ?? ""]),
              })} />
            </div>
            {papersQ.isLoading ? <Skeleton className="h-16 w-full" /> : null}
            {papersQ.data && papers.length === 0 ? <p className="surface p-5 text-center text-sm text-muted-foreground">No papers yet.</p> : null}
            {days.map(([day, list]) => (
              <section key={day} aria-label={dayText(day)} className="space-y-1">
                <h3 className="text-sm font-semibold">{dayText(day)}</h3>
                <ul className="grid gap-2">
                  {list.map((p) => (
                    <li key={p.id} className="surface flex items-start justify-between gap-2 p-3">
                      <button type="button" onClick={() => setEditing(p)} className="min-w-0 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                        <span className="block break-words text-sm font-medium">{p.subjectName}, {p.classLabel}</span>
                        <span className="block text-xs tabular-nums text-muted-foreground">{timeRange(p)} ({durationText(p)}){p.room ? ` · ${p.room}` : ""}</span>
                        {p.invigilatorNames ? <span className="block break-words text-xs text-muted-foreground">Invigilating: {p.invigilatorNames}</span> : null}
                        {p.notes ? <span className="block break-words text-xs text-muted-foreground">{p.notes}</span> : null}
                      </button>
                      <span className="flex shrink-0">
                        {canInvigilate ? <Button type="button" size="icon" variant="ghost" aria-label={`Invigilators for ${p.subjectName}, ${p.classLabel}`} onClick={() => setInvig(p)}><UserRoundCheck className="size-4" aria-hidden /></Button> : null}
                        <Button type="button" size="icon" variant="ghost" className="text-destructive" aria-label={`Delete ${p.subjectName}, ${p.classLabel}`} disabled={remove.isPending} onClick={() => remove.mutate(p.id)}><Trash2 className="size-4" aria-hidden /></Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <FormMessage error={remove.isError ? friendlyError(remove.error) : publish.isError ? friendlyError(publish.error) : null}
              ok={publish.isSuccess ? (published ? `Published. ${publish.data} ${publish.data === 1 ? "person was" : "people were"} told.` : "Taken back to a draft.") : null} />
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
              <Button type="button" variant={published ? "outline" : "default"} disabled={publish.isPending || (!published && papers.length === 0)} onClick={() => publish.mutate(!published)}>
                {publish.isPending ? "Saving" : published ? "Take back to a draft" : "Publish to parents and pupils"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
