import { FLAG_HELP, flagLabel, type ClockFlag } from "../../../lib/clockin";
import type { RosterStatus } from "../../../lib/data/clockin";
import { cn } from "../../components/ui/utils";

const STATUS_STYLE: Record<RosterStatus, string> = {
  present: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  late: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  absent: "bg-foreground/10 text-muted-foreground",
};
const STATUS_LABEL: Record<RosterStatus, string> = { present: "Present", late: "Late", absent: "Absent" };

export function StatusChip({ status }: { status: RosterStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

/** Flags are things worth a second look, so they are shown in words, never hidden. */
export function Flags({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} title={FLAG_HELP[f as ClockFlag] ?? f} className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[11px] text-amber-800 dark:text-amber-200">{flagLabel(f)}</span>
      ))}
    </span>
  );
}
