import { useState, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { cn } from "../ui/utils";

export type DialogVariant = "destructive" | "warning" | "info" | "success";

export interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  variant?: DialogVariant;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
  loading?: boolean;
  /** Optional safety confirmation phrase (e.g. "DELETE" or student ID) the user must type */
  confirmationPhrase?: string;
  /** Optional details badge or key-value list */
  details?: ReactNode;
}

const VARIANT_CONFIG: Record<
  DialogVariant,
  {
    icon: typeof AlertCircle;
    iconBg: string;
    iconColor: string;
    confirmButtonVariant: "destructive" | "default" | "outline";
    borderGlow: string;
  }
> = {
  destructive: {
    icon: ShieldAlert,
    iconBg: "bg-destructive/15",
    iconColor: "text-destructive",
    confirmButtonVariant: "destructive",
    borderGlow: "shadow-[0_0_35px_-8px_rgba(232,64,64,0.35)]",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-500",
    confirmButtonVariant: "default",
    borderGlow: "shadow-[0_0_35px_-8px_rgba(245,158,11,0.3)]",
  },
  info: {
    icon: Info,
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
    confirmButtonVariant: "default",
    borderGlow: "shadow-[0_0_35px_-8px_color-mix(in_srgb,var(--primary)_40%,transparent)]",
  },
  success: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-500",
    confirmButtonVariant: "default",
    borderGlow: "shadow-[0_0_35px_-8px_rgba(16,185,129,0.3)]",
  },
};

export function ActionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  variant = "info",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  loading: externalLoading = false,
  confirmationPhrase,
  details,
}: ActionConfirmDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState("");
  const [internalLoading, setInternalLoading] = useState(false);
  const cfg = VARIANT_CONFIG[variant];
  const Icon = cfg.icon;

  const isPhrasedMatched = !confirmationPhrase || typedPhrase.trim() === confirmationPhrase.trim();
  const busy = externalLoading || internalLoading;

  async function handleConfirm() {
    if (!isPhrasedMatched || busy) return;
    try {
      setInternalLoading(true);
      await onConfirm();
      onOpenChange(false);
    } finally {
      setInternalLoading(false);
      setTypedPhrase("");
    }
  }

  function handleCancel() {
    if (busy) return;
    onCancel?.();
    onOpenChange(false);
    setTypedPhrase("");
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/60 backdrop-blur-xs",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "surface fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-6 outline-hidden",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200",
            cfg.borderGlow,
          )}
        >
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10",
                cfg.iconBg,
                cfg.iconColor,
              )}
            >
              <Icon className="size-6" strokeWidth={2} aria-hidden />
            </div>

            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              <DialogPrimitive.Title className="text-base font-semibold tracking-tight text-foreground">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            </div>
          </div>

          {details ? (
            <div className="mt-4 rounded-xl border border-border bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
              {details}
            </div>
          ) : null}

          {confirmationPhrase ? (
            <div className="mt-4 space-y-2 rounded-xl border border-border/80 bg-foreground/[0.03] p-3.5">
              <Label htmlFor="confirmation-phrase" className="text-xs font-medium text-foreground">
                Type <span className="font-mono font-bold text-destructive">{confirmationPhrase}</span> to confirm:
              </Label>
              <Input
                id="confirmation-phrase"
                value={typedPhrase}
                onChange={(e) => setTypedPhrase(e.target.value)}
                placeholder={confirmationPhrase}
                autoFocus
                disabled={busy}
                className="font-mono text-sm uppercase tracking-wider"
              />
            </div>
          ) : null}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={busy}
              className="rounded-xl"
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              variant={cfg.confirmButtonVariant}
              onClick={() => void handleConfirm()}
              disabled={busy || !isPhrasedMatched}
              className="rounded-xl shadow-md"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {busy ? "Processing…" : confirmText}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
