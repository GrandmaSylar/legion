import type { ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, XCircle } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import { cn } from "../ui/utils";

export type FeedbackType = "success" | "error" | "info" | "warning";

export interface ActionFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  message: ReactNode;
  type?: FeedbackType;
  buttonText?: string;
  onClose?: () => void;
  details?: ReactNode;
}

const TYPE_CONFIG: Record<
  FeedbackType,
  {
    icon: typeof CheckCircle2;
    iconBg: string;
    iconColor: string;
    shadow: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconBg: "bg-emerald-500/15",
    iconColor: "text-emerald-500",
    shadow: "shadow-[0_0_35px_-8px_rgba(16,185,129,0.3)]",
  },
  error: {
    icon: XCircle,
    iconBg: "bg-destructive/15",
    iconColor: "text-destructive",
    shadow: "shadow-[0_0_35px_-8px_rgba(232,64,64,0.35)]",
  },
  warning: {
    icon: AlertCircle,
    iconBg: "bg-amber-500/15",
    iconColor: "text-amber-500",
    shadow: "shadow-[0_0_35px_-8px_rgba(245,158,11,0.3)]",
  },
  info: {
    icon: Info,
    iconBg: "bg-primary/15",
    iconColor: "text-primary",
    shadow: "shadow-[0_0_35px_-8px_color-mix(in_srgb,var(--primary)_40%,transparent)]",
  },
};

export function ActionFeedbackDialog({
  open,
  onOpenChange,
  title,
  message,
  type = "info",
  buttonText = "Got it",
  onClose,
  details,
}: ActionFeedbackDialogProps) {
  const cfg = TYPE_CONFIG[type];
  const Icon = cfg.icon;

  function handleClose() {
    onClose?.();
    onOpenChange(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
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
            cfg.shadow,
          )}
        >
          <div className="flex flex-col items-center text-center">
            <div
              className={cn(
                "mb-4 grid size-14 place-items-center rounded-2xl border border-white/10",
                cfg.iconBg,
                cfg.iconColor,
              )}
            >
              <Icon className="size-7" strokeWidth={2} aria-hidden />
            </div>

            <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-foreground">
              {title}
            </DialogPrimitive.Title>

            <DialogPrimitive.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {message}
            </DialogPrimitive.Description>

            {details ? (
              <div className="mt-4 w-full text-left rounded-xl border border-border bg-foreground/[0.02] p-3 text-xs text-muted-foreground">
                {details}
              </div>
            ) : null}

            <div className="mt-6 w-full">
              <Button
                type="button"
                onClick={handleClose}
                className="w-full rounded-xl shadow-md"
              >
                {buttonText}
              </Button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
