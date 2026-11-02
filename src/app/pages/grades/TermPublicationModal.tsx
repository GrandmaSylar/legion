import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Check,
  Globe,
  Loader2,
  Lock,
  ShieldCheck,
  Unlock,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  setTermReportPublication,
  type TermReportPublication,
} from "../../../lib/data/grades";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Field } from "../../components/fields";
import { cn } from "../../components/ui/utils";

export interface TermPublicationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  className: string;
  termId: string;
  termName: string;
  currentPublication?: TermReportPublication | null;
  currency?: string;
  onSaved?: () => void;
}

export function TermPublicationModal({
  open,
  onOpenChange,
  classId,
  className,
  termId,
  termName,
  currentPublication,
  currency = "GHS",
  onSaved,
}: TermPublicationModalProps) {
  const qc = useQueryClient();

  const [isPublished, setIsPublished] = useState(false);
  const [reopeningDate, setReopeningDate] = useState("");
  const [vacationDate, setVacationDate] = useState("");
  const [nextTermFees, setNextTermFees] = useState("");

  useEffect(() => {
    if (open) {
      setIsPublished(currentPublication?.isPublished ?? false);
      setReopeningDate(currentPublication?.reopeningDate ?? "");
      setVacationDate(currentPublication?.vacationDate ?? "");
      setNextTermFees(
        currentPublication?.nextTermFees !== null && currentPublication?.nextTermFees !== undefined
          ? String(currentPublication.nextTermFees)
          : "",
      );
    }
  }, [open, currentPublication]);

  const saveMutation = useMutation({
    mutationFn: () =>
      setTermReportPublication({
        classId,
        termId,
        isPublished,
        reopeningDate: reopeningDate || null,
        vacationDate: vacationDate || null,
        nextTermFees: nextTermFees.trim() ? Number(nextTermFees) : null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["term-publication", classId, termId] });
      void qc.invalidateQueries({ queryKey: ["broadsheet"] });
      onSaved?.();
      onOpenChange(false);
    },
  });

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200" />
        <DialogPrimitive.Content className="surface fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 p-6 shadow-2xl outline-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "grid size-11 place-items-center rounded-2xl border",
                  isPublished
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
                )}
              >
                {isPublished ? <Globe className="size-5" /> : <Lock className="size-5" />}
              </div>
              <div>
                <DialogPrimitive.Title className="text-base font-semibold text-foreground">
                  Publish &amp; Term Settings
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-xs text-muted-foreground">
                  {className} · {termName}
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

          <div className="space-y-4 py-4">
            {/* Publication Toggle */}
            <div className="rounded-xl border border-border/80 bg-foreground/[0.02] p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {isPublished ? "Report Cards Published" : "Draft Status (Unpublished)"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isPublished
                      ? "Parents and students with accounts can view official final report cards."
                      : "Reports are accessible only to teachers & administrators for internal audit."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublished((v) => !v)}
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden",
                    isPublished ? "bg-emerald-500" : "bg-muted-foreground/30",
                  )}
                  role="switch"
                  aria-checked={isPublished}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-5 rounded-full bg-white shadow-md transform ring-0 transition duration-200 ease-in-out",
                      isPublished ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </button>
              </div>

              {currentPublication?.publishedAt ? (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border/40">
                  <ShieldCheck className="size-3 text-emerald-500" />
                  <span>
                    Last published: {new Date(currentPublication.publishedAt).toLocaleString()}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Term dates & Next term logistics */}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vacation Date" htmlFor="term-vacation-date">
                <Input
                  id="term-vacation-date"
                  type="date"
                  value={vacationDate}
                  onChange={(e) => setVacationDate(e.target.value)}
                  className="text-xs"
                />
              </Field>

              <Field label="Next Term Re-opening Date" htmlFor="term-reopen-date">
                <Input
                  id="term-reopen-date"
                  type="date"
                  value={reopeningDate}
                  onChange={(e) => setReopeningDate(e.target.value)}
                  className="text-xs"
                />
              </Field>
            </div>

            <Field label={`Next Term Projected Fees (${currency})`} htmlFor="term-next-fees">
              <Input
                id="term-next-fees"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g. 850.00"
                value={nextTermFees}
                onChange={(e) => setNextTermFees(e.target.value)}
                className="text-xs"
              />
              <span className="text-[11px] text-muted-foreground">
                Printed on the student report card to inform parents in advance.
              </span>
            </Field>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
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
              {saveMutation.isPending ? "Updating…" : "Save Settings"}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
