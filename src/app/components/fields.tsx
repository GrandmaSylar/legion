// Small form pieces shared by the setup screens. A native <select> is used on
// purpose: it is accessible, fast, and gets the OS picker on phones.
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "./ui/utils";

export const controlClass =
  "h-10 w-full rounded-md border border-input bg-input-background px-3 text-sm text-foreground " +
  "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 " +
  "focus-visible:outline-[var(--ring)] disabled:opacity-50";

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

export function NativeSelect({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(controlClass, className)}>
      {children}
    </select>
  );
}

/** Inline status for a form: errors are announced, successes are quiet. */
export function FormMessage({ error, ok }: { error?: string | null; ok?: string | null }) {
  return (
    <p
      role={error ? "alert" : "status"}
      aria-live="polite"
      className={cn("min-h-5 text-sm", error ? "text-destructive" : "text-muted-foreground")}
    >
      {error ?? ok ?? ""}
    </p>
  );
}

export function CurrentBadge() {
  return (
    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">Current</span>
  );
}
