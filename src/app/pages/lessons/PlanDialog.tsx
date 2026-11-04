import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deletePlan, listTopics, savePlan, submitPlan, type LessonPlan, type MyClassSubject, type PlanPeriod } from "../../../lib/data/lessons";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { StatusBadge, dayLabel, periodLabel } from "./shared";

/**
 * Write a plan for one class and subject for one period. A plan that is submitted or approved is read only;
 * one that was sent back shows the reviewer's comment and can be changed and submitted again.
 */
export function PlanDialog({
  open, onClose, target, plan, period, requireReview,
}: { open: boolean; onClose: () => void; target: MyClassSubject | null; plan: LessonPlan | null; period: PlanPeriod | null; requireReview: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && target && period ? <Form key={`${target.id}-${period.start}`} target={target} plan={plan} period={period} requireReview={requireReview} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Form({ target, plan, period, requireReview, onClose }: { target: MyClassSubject; plan: LessonPlan | null; period: PlanPeriod; requireReview: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const locked = plan?.status === "submitted" || plan?.status === "approved";
  const topics = useQuery({ queryKey: ["syllabus-topics"], queryFn: listTopics, staleTime: 60_000 });
  const mine = useMemo(() => (topics.data ?? []).filter((t) => t.subjectId === target.subjectId && t.levelId === target.levelId), [topics.data, target]);
  const [f, setF] = useState({
    topicId: plan?.topicId ?? "", topic: plan?.topic ?? "", objectives: plan?.objectives ?? "", activities: plan?.activities ?? "",
    resources: plan?.resources ?? "", homework: plan?.homework ?? "", notes: plan?.notes ?? "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((c) => ({ ...c, [k]: v }));

  const done = () => { void qc.invalidateQueries({ queryKey: ["lesson-plans"] }); void qc.invalidateQueries({ queryKey: ["plan-tracker"] }); onClose(); };
  const input = { ...f, id: plan?.id, classSubjectId: target.id, weekStart: period.start };
  const save = useMutation({ mutationFn: () => savePlan(input), onSuccess: done });
  const submit = useMutation({ mutationFn: async () => { const id = await savePlan(input); await submitPlan(id); }, onSuccess: done });
  const remove = useMutation({ mutationFn: () => deletePlan(plan!.id), onSuccess: done });

  const busy = save.isPending || submit.isPending || remove.isPending;
  const problem = !f.topic.trim() ? "Say what the topic is." : null;
  const submitProblem = problem ?? (!f.objectives.trim() ? "Add the objectives before submitting." : null);
  const err = save.isError ? friendlyError(save.error) : submit.isError ? friendlyError(submit.error) : remove.isError ? friendlyError(remove.error) : null;
  const go = (e: FormEvent) => { e.preventDefault(); if (!problem && !locked) save.mutate(); };

  return (
    <form onSubmit={go} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="break-words">{target.subjectName}, {target.classLabel}</DialogTitle>
        <DialogDescription>
          {periodLabel(period)} · due {dayLabel(period.dueOn)} <span className="ml-1 align-middle"><StatusBadge status={plan?.status ?? null} requireReview={requireReview} /></span>
        </DialogDescription>
      </DialogHeader>

      {plan?.status === "changes_requested" && plan.reviewComment ? (
        <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong className="font-semibold">Sent back:</strong> {plan.reviewComment}
        </p>
      ) : null}
      {plan?.status === "approved" && plan.reviewComment ? <p className="rounded-xl bg-emerald-500/10 p-3 text-sm"><strong className="font-semibold">Comment:</strong> {plan.reviewComment}</p> : null}

      {mine.length > 0 && !locked ? (
        <Field label="From the syllabus (optional)" htmlFor="lp-syl">
          <NativeSelect id="lp-syl" value={f.topicId} onChange={(e) => {
            const t = mine.find((x) => x.id === e.target.value);
            setF((c) => ({ ...c, topicId: e.target.value, topic: t ? t.title : c.topic, objectives: t && !c.objectives ? (t.objectives ?? "") : c.objectives }));
          }}>
            <option value="">Choose a topic, or write your own below</option>
            {mine.map((t) => <option key={t.id} value={t.id}>{t.termNo ? `T${t.termNo}${t.weekNo ? ` W${t.weekNo}` : ""} · ` : ""}{t.title}</option>)}
          </NativeSelect>
        </Field>
      ) : null}
      <Field label="Topic" htmlFor="lp-topic"><Input id="lp-topic" value={f.topic} maxLength={160} disabled={locked} onChange={(e) => set("topic", e.target.value)} placeholder="e.g. Adding fractions" required /></Field>
      <Field label="Objectives: what pupils will be able to do" htmlFor="lp-obj"><Textarea id="lp-obj" rows={3} value={f.objectives} maxLength={2000} disabled={locked} onChange={(e) => set("objectives", e.target.value)} /></Field>
      <Field label="Activities" htmlFor="lp-act"><Textarea id="lp-act" rows={3} value={f.activities} maxLength={2000} disabled={locked} onChange={(e) => set("activities", e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Resources (optional)" htmlFor="lp-res"><Textarea id="lp-res" rows={2} value={f.resources} maxLength={1000} disabled={locked} onChange={(e) => set("resources", e.target.value)} /></Field>
        <Field label="Homework (optional)" htmlFor="lp-hw"><Textarea id="lp-hw" rows={2} value={f.homework} maxLength={1000} disabled={locked} onChange={(e) => set("homework", e.target.value)} /></Field>
      </div>
      <Field label="Notes (optional)" htmlFor="lp-notes"><Textarea id="lp-notes" rows={2} value={f.notes} maxLength={1000} disabled={locked} onChange={(e) => set("notes", e.target.value)} /></Field>

      <FormMessage error={problem && (f.topic || f.objectives) ? problem : err} />
      <DialogFooter className="gap-2 sm:justify-between">
        {plan && plan.status === "draft" ? (
          confirmDelete ? (
            <span className="flex items-center gap-2">
              <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={() => remove.mutate()}>Yes, delete</Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep it</Button>
            </span>
          ) : <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmDelete(true)}>Delete draft</Button>
        ) : <span />}
        <span className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>{locked ? "Close" : "Cancel"}</Button>
          {!locked ? (
            <>
              <Button type="submit" variant="outline" disabled={busy || !!problem}>{save.isPending ? "Saving" : "Save draft"}</Button>
              <Button type="button" disabled={busy || !!submitProblem} onClick={() => submit.mutate()} title={submitProblem ?? undefined}>{submit.isPending ? "Submitting" : requireReview ? "Submit for review" : "Submit"}</Button>
            </>
          ) : null}
        </span>
      </DialogFooter>
    </form>
  );
}
