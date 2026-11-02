import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  HeartHandshake,
  Loader2,
  UserCheck,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  saveStudentBehavioralAssessment,
  type PromotionalStatus,
  type StudentBehavioralAssessment,
} from "../../../lib/data/grades";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";

export interface BehavioralAssessmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollmentId: string;
  studentName: string;
  admissionNo: string;
  className: string;
  termId: string;
  termName: string;
  currentAssessment?: StudentBehavioralAssessment | null;
  onSaved?: () => void;
}

const TRAIT_CONFIG = [
  { key: "punctuality", label: "Punctuality & Attendance", desc: "Regularity and timeliness to class and school assemblies" },
  { key: "neatness", label: "Neatness & Bearing", desc: "Cleanliness of school uniform, books, and general grooming" },
  { key: "politeness", label: "Politeness & Respect", desc: "Courteous conduct towards teachers, staff, and peers" },
  { key: "attitudeToWork", label: "Attitude to Classwork", desc: "Attention, homework completion, diligence, and participation" },
  { key: "leadership", label: "Leadership & Initiative", desc: "Teamwork, responsibility, and positive peer influence" },
] as const;

const SCORE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: "1 - Unsatisfactory", color: "bg-destructive/15 text-destructive border-destructive/30" },
  2: { label: "2 - Needs Attention", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  3: { label: "3 - Satisfactory", color: "bg-primary/10 text-primary border-primary/20" },
  4: { label: "4 - Very Good", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  5: { label: "5 - Exemplary", color: "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-emerald-500/50 font-semibold" },
};

const TEACHER_REMARK_PRESETS = [
  "An exceptionally diligent and well-behaved pupil. Keep up the high standard!",
  "A dedicated learner with commendable classroom participation and steady progress.",
  "Good performance overall, but needs to devote more time to home study in core subjects.",
  "Capable of much better results if greater concentration and consistency are maintained.",
  "Quiet and well-mannered, but needs to actively participate more in class discussions.",
  "Has shown great improvement this term through hard work and determination.",
  "Attendance and homework submission require closer parental monitoring.",
];

const HEADTEACHER_REMARK_PRESETS = [
  "Promising term's performance. With sustained discipline, excellence is guaranteed.",
  "An impressive report. A great asset to the school community.",
  "Fair performance with noticeable room for academic advancement.",
  "Recommended for extra evening study hours and focused subject coaching.",
  "Promoted with commendation.",
];

export function BehavioralAssessmentModal({
  open,
  onOpenChange,
  enrollmentId,
  studentName,
  admissionNo,
  className,
  termId,
  termName,
  currentAssessment,
  onSaved,
}: BehavioralAssessmentModalProps) {
  const qc = useQueryClient();

  const [punctuality, setPunctuality] = useState<number | null>(null);
  const [neatness, setNeatness] = useState<number | null>(null);
  const [politeness, setPoliteness] = useState<number | null>(null);
  const [attitudeToWork, setAttitudeToWork] = useState<number | null>(null);
  const [leadership, setLeadership] = useState<number | null>(null);
  const [teacherRemarks, setTeacherRemarks] = useState("");
  const [headteacherRemarks, setHeadteacherRemarks] = useState("");
  const [promotionalStatus, setPromotionalStatus] = useState<PromotionalStatus>("pending");

  useEffect(() => {
    if (open) {
      setPunctuality(currentAssessment?.punctuality ?? 4);
      setNeatness(currentAssessment?.neatness ?? 4);
      setPoliteness(currentAssessment?.politeness ?? 4);
      setAttitudeToWork(currentAssessment?.attitudeToWork ?? 4);
      setLeadership(currentAssessment?.leadership ?? 3);
      setTeacherRemarks(currentAssessment?.teacherRemarks ?? "");
      setHeadteacherRemarks(currentAssessment?.headteacherRemarks ?? "");
      setPromotionalStatus(currentAssessment?.promotionalStatus ?? "pending");
    }
  }, [open, currentAssessment]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveStudentBehavioralAssessment({
        enrollmentId,
        termId,
        punctuality,
        neatness,
        politeness,
        attitudeToWork,
        leadership,
        teacherRemarks: teacherRemarks.trim() || null,
        headteacherRemarks: headteacherRemarks.trim() || null,
        promotionalStatus,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["behavioral-assessments"] });
      void qc.invalidateQueries({ queryKey: ["broadsheet"] });
      onSaved?.();
      onOpenChange(false);
    },
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <DialogPrimitive.Content className="surface fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden p-0 shadow-2xl outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border p-5">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl bg-primary/15 text-primary">
                <HeartHandshake className="size-5" />
              </div>
              <div>
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  Affective Traits &amp; Remarks
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  {studentName} ({admissionNo}) · {className} · {termName}
                </DialogPrimitive.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Form body */}
          <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
            {/* Trait Assessment Radios */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                1. Affective &amp; Psychomotor Domains (1–5 Rating)
              </h3>

              <div className="space-y-3">
                {TRAIT_CONFIG.map(({ key, label, desc }) => {
                  const val =
                    key === "punctuality"
                      ? punctuality
                      : key === "neatness"
                        ? neatness
                        : key === "politeness"
                          ? politeness
                          : key === "attitudeToWork"
                            ? attitudeToWork
                            : leadership;

                  const setVal = (n: number) => {
                    if (key === "punctuality") setPunctuality(n);
                    else if (key === "neatness") setNeatness(n);
                    else if (key === "politeness") setPoliteness(n);
                    else if (key === "attitudeToWork") setAttitudeToWork(n);
                    else setLeadership(n);
                  };

                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-border/80 bg-foreground/[0.02] p-3 transition-colors hover:border-border"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-foreground">{label}</div>
                          <div className="text-[11px] text-muted-foreground">{desc}</div>
                        </div>

                        {/* 1-5 selector */}
                        <div className="flex items-center gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setVal(n)}
                              className={cn(
                                "grid size-8 place-items-center rounded-lg text-xs font-semibold transition-all",
                                val === n
                                  ? "bg-primary text-primary-foreground shadow-sm scale-105"
                                  : "border border-border/70 hover:bg-foreground/5 text-muted-foreground",
                              )}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>

                      {val ? (
                        <div className="mt-2 text-[11px]">
                          <span
                            className={cn(
                              "inline-block rounded-md border px-2 py-0.5 text-[10px]",
                              SCORE_LABELS[val]?.color,
                            )}
                          >
                            {SCORE_LABELS[val]?.label}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Teacher Remarks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="teacher-remarks" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  2. Class Teacher Remarks
                </Label>
                <span className="text-[11px] text-muted-foreground">Appears on report card</span>
              </div>

              {/* Quick suggestion chips */}
              <div className="flex flex-wrap gap-1.5">
                {TEACHER_REMARK_PRESETS.slice(0, 4).map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setTeacherRemarks(preset)}
                    className="rounded-full border border-border/70 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground text-left"
                  >
                    “{preset.slice(0, 36)}…”
                  </button>
                ))}
              </div>

              <Textarea
                id="teacher-remarks"
                value={teacherRemarks}
                onChange={(e) => setTeacherRemarks(e.target.value)}
                placeholder="Enter personalized remarks on academic effort, discipline, and areas for improvement…"
                rows={2}
                className="resize-none text-xs"
              />
            </div>

            {/* Headteacher Remarks */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="head-remarks" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  3. Headteacher Remarks &amp; Endorsement
                </Label>
                <span className="text-[11px] text-muted-foreground">Official school sign-off</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {HEADTEACHER_REMARK_PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setHeadteacherRemarks(preset)}
                    className="rounded-full border border-border/70 bg-foreground/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground text-left"
                  >
                    “{preset.slice(0, 38)}…”
                  </button>
                ))}
              </div>

              <Input
                id="head-remarks"
                value={headteacherRemarks}
                onChange={(e) => setHeadteacherRemarks(e.target.value)}
                placeholder="Headteacher endorsement remark…"
                className="text-xs"
              />
            </div>

            {/* Promotional Decision */}
            <div className="space-y-2 rounded-xl border border-border/80 bg-foreground/[0.02] p-4">
              <Label htmlFor="promotional-status" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                4. Promotional Decision (End of Year / Terminal)
              </Label>
              <NativeSelect
                id="promotional-status"
                value={promotionalStatus}
                onChange={(e) => setPromotionalStatus(e.target.value as PromotionalStatus)}
                className="text-xs"
              >
                <option value="pending">Pending / Term in Progress</option>
                <option value="promoted">Promoted to Next Level</option>
                <option value="promoted_on_trial">Promoted on Trial</option>
                <option value="repeated">Repeated / To Repeat Level</option>
                <option value="withdrawn">Withdrawn</option>
              </NativeSelect>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border p-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {saveMutation.isPending ? "Saving…" : "Save Assessment"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
