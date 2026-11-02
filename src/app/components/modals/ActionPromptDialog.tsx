import { useState, type FormEvent, type ReactNode } from "react";
import { HelpCircle, Loader2, MessageSquare } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { cn } from "../ui/utils";

export interface ActionPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
  submitText?: string;
  cancelText?: string;
  onSubmit: (value: string) => Promise<void> | void;
  onCancel?: () => void;
  loading?: boolean;
  validate?: (value: string) => string | null | undefined;
}

export function ActionPromptDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  defaultValue = "",
  required = true,
  multiline = false,
  submitText = "Submit",
  cancelText = "Cancel",
  onSubmit,
  onCancel,
  loading: externalLoading = false,
  validate,
}: ActionPromptDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [internalLoading, setInternalLoading] = useState(false);

  const busy = externalLoading || internalLoading;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = value.trim();

    if (required && !trimmed) {
      setError("This field is required.");
      return;
    }

    if (validate) {
      const customErr = validate(trimmed);
      if (customErr) {
        setError(customErr);
        return;
      }
    }

    try {
      setInternalLoading(true);
      setError(null);
      await onSubmit(trimmed);
      onOpenChange(false);
      setValue(defaultValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setInternalLoading(false);
    }
  }

  function handleCancel() {
    if (busy) return;
    onCancel?.();
    onOpenChange(false);
    setError(null);
    setValue(defaultValue);
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
            "surface fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 p-6 outline-hidden shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200",
          )}
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/10 bg-primary/15 text-primary">
                {multiline ? (
                  <MessageSquare className="size-6" strokeWidth={1.75} aria-hidden />
                ) : (
                  <HelpCircle className="size-6" strokeWidth={1.75} aria-hidden />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1 pt-0.5">
                <DialogPrimitive.Title className="text-base font-semibold tracking-tight text-foreground">
                  {title}
                </DialogPrimitive.Title>
                {description ? (
                  <DialogPrimitive.Description className="text-sm leading-relaxed text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                ) : null}
              </div>
            </div>

            <div className="mt-5 space-y-2">
              <Label htmlFor="prompt-input" className="text-xs font-medium text-foreground">
                {label} {required ? <span className="text-destructive">*</span> : null}
              </Label>

              {multiline ? (
                <Textarea
                  id="prompt-input"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={placeholder}
                  autoFocus
                  disabled={busy}
                  rows={3}
                  className="resize-none text-sm"
                />
              ) : (
                <Input
                  id="prompt-input"
                  value={value}
                  onChange={(e) => {
                    setValue(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder={placeholder}
                  autoFocus
                  disabled={busy}
                  className="text-sm"
                />
              )}

              {error ? (
                <p role="alert" className="text-xs text-destructive">
                  {error}
                </p>
              ) : null}
            </div>

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
                type="submit"
                disabled={busy || (required && !value.trim())}
                className="rounded-xl shadow-md"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? "Saving…" : submitText}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
