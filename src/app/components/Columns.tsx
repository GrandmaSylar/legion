import type { ReactNode } from "react";
import { cn } from "./ui/utils";

/**
 * A page body that uses a wide screen: a main column and a side column next to it, which stack (main first) on phones
 * and tablets. The side column holds what helps you do the main task (a live summary, a preview, status and
 * admin cards) and can follow you down the page ("sticky") so it is always in view while you work.
 *
 *   narrow:   the side column is a fixed, comfortable width and the main column takes the rest
 *   balanced: the two share the width about 3 to 2
 */
const LAYOUT = {
  narrow: "lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]",
  balanced: "lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
} as const;

export function Columns({ main, side, layout = "narrow", sticky = false, className }: {
  main: ReactNode;
  side?: ReactNode;
  layout?: keyof typeof LAYOUT;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("grid items-start gap-4", side ? LAYOUT[layout] : "", className)}>
      <div className="min-w-0 space-y-4">{main}</div>
      {side ? <div className={cn("min-w-0 space-y-4", sticky && "lg:sticky lg:top-4")}>{side}</div> : null}
    </div>
  );
}
