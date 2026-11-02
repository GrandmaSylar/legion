import { cn } from "../ui/utils";

export interface DevelopedByPhinovaProps {
  variant?: "minimal" | "badge" | "vintage" | "inline";
  className?: string;
  subtle?: boolean;
}

/**
 * Minimal and non-disturbing brand hallmark for "developed by phinova".
 * Designed to sit gracefully at vintage/vantage points across the application.
 */
export function DevelopedByPhinova({
  variant = "minimal",
  className,
  subtle = true,
}: DevelopedByPhinovaProps) {
  if (variant === "badge") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-foreground/[0.03] px-2.5 py-0.5 text-[10px] text-muted-foreground/75 backdrop-blur-xs select-none transition-colors hover:text-foreground hover:border-border",
          className,
        )}
      >
        <span className="size-1 rounded-full bg-primary/70" />
        <span className="tracking-wider uppercase text-[9px] font-medium text-muted-foreground/60">
          developed by
        </span>
        <span className="font-semibold tracking-wider text-foreground/80">phinova</span>
      </div>
    );
  }

  if (variant === "vintage") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 select-none text-[10px] tracking-[0.2em] uppercase font-mono transition-opacity duration-200",
          subtle ? "text-muted-foreground/45 hover:text-muted-foreground/80" : "text-muted-foreground/70 hover:text-foreground",
          className,
        )}
      >
        <span>developed by</span>
        <span className="inline-block size-0.5 rounded-full bg-primary" />
        <span className="font-semibold text-foreground/75 tracking-[0.25em]">phinova</span>
      </div>
    );
  }

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 select-none text-[10px] tracking-wide transition-colors",
          subtle ? "text-muted-foreground/50 hover:text-muted-foreground/80" : "text-muted-foreground/75 hover:text-foreground",
          className,
        )}
      >
        <span>developed by</span>
        <span className="font-medium text-foreground/75">phinova</span>
      </span>
    );
  }

  // Default: minimal
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 select-none text-[10px] tracking-widest uppercase font-sans transition-colors duration-200",
        subtle ? "text-muted-foreground/50 hover:text-muted-foreground/80" : "text-muted-foreground/70 hover:text-foreground",
        className,
      )}
    >
      <span className="text-[9px] font-normal lowercase tracking-wider opacity-80">developed by</span>
      <span className="font-semibold text-foreground/70 lowercase tracking-widest hover:text-primary">phinova</span>
    </div>
  );
}
