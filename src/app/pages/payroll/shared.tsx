import { useQuery } from "@tanstack/react-query";
import { getPayrollConfig } from "../../../lib/data/payroll";
import { RUN_STATUS_LABELS, money, type RunStatus } from "../../../lib/payroll";
import { cn } from "../../components/ui/utils";

const STYLE: Record<RunStatus, string> = {
  draft: "bg-foreground/10 text-muted-foreground",
  calculated: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  in_approval: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  approved: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  paid: "bg-emerald-600/20 text-emerald-900 dark:text-emerald-100",
  cancelled: "bg-foreground/10 text-muted-foreground line-through",
};

export function RunStatusChip({ status }: { status: RunStatus }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STYLE[status])}>{RUN_STATUS_LABELS[status]}</span>;
}

/** The school's currency, and a function that writes an amount in it. */
export function useMoney() {
  const config = useQuery({ queryKey: ["payroll-config"], queryFn: getPayrollConfig, staleTime: 60_000, retry: false });
  const currency = config.data?.currency ?? "GHS";
  return { currency, fmt: (n: number | string | null | undefined) => money(n, currency) };
}
