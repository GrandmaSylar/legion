import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { listCapabilityCatalogue, listPresets } from "../../../lib/data/access";
import { ROLE_LABELS, type AppRole } from "../../../lib/permissions";
import { Skeleton } from "../../components/ui/skeleton";

const MODULE_NAME: Record<string, string> = {
  students: "Students", attendance: "Attendance", grades: "Grades", fees: "Fees and receipts", expenses: "Expenses", analytics: "Analytics", staff: "Staff",
  messages: "Messages", notices: "Notices", timetable: "Timetable", users: "Users", settings: "School settings", access: "Who can do what", audit: "Audit trail",
  calendar: "Calendar", tasks: "Tasks", lessons: "Lesson plans", clockin: "Clock-in", complaints: "Complaints", payroll: "Payroll",
};
const moduleName = (m: string) => MODULE_NAME[m] ?? m.charAt(0).toUpperCase() + m.slice(1);

/**
 * A live answer to "what will this person be able to do?" for the job(s) chosen so far, grouped by area. It changes as
 * the jobs are ticked, so the choice is understood before the account is made. Parents and students are portal accounts
 * with no staff actions, and a developer holds everything.
 */
export function JobPreview({ roles }: { roles: AppRole[] }) {
  const catalogue = useQuery({ queryKey: ["access-catalogue"], queryFn: listCapabilityCatalogue, staleTime: 10 * 60_000 });
  const presets = useQuery({ queryKey: ["access-presets"], queryFn: listPresets, staleTime: 10 * 60_000 });

  const staffRoles = roles.filter((r) => r !== "parent" && r !== "student");
  const groups = useMemo(() => {
    const keys = new Set<string>();
    for (const r of staffRoles) for (const k of presets.data?.[r] ?? []) keys.add(k);
    const byModule = new Map<string, string[]>();
    for (const c of catalogue.data ?? []) if (keys.has(c.key)) byModule.set(c.module, [...(byModule.get(c.module) ?? []), c.label]);
    return [...byModule.entries()].sort((a, b) => moduleName(a[0]).localeCompare(moduleName(b[0])));
  }, [staffRoles.join(","), presets.data, catalogue.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <section className="surface space-y-3 p-4" aria-label="What this job gives">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0">
          <h2 className="text-base font-medium">What this job gives</h2>
          <p className="text-xs text-muted-foreground">A starting set of access. You can fine-tune it after the account is made.</p>
        </div>
      </div>
      {roles.length === 0 ? <p className="text-sm text-muted-foreground">Choose a job and its access appears here.</p> : null}
      {roles.includes("developer") ? <p className="rounded-xl bg-amber-500/10 p-3 text-sm">A developer can do everything in the system.</p> : null}
      {roles.some((r) => r === "parent" || r === "student") && staffRoles.length === 0 ? (
        <p className="text-sm text-muted-foreground">{roles.includes("parent") ? "A parent" : "A student"} sees only their own records, such as marks, fees and notices. There is nothing else to set.</p>
      ) : null}
      {staffRoles.length > 0 && (catalogue.isLoading || presets.isLoading) ? <Skeleton className="h-24 w-full" /> : null}
      {staffRoles.length > 0 && total > 0 ? (
        <>
          <p className="text-sm"><strong>{staffRoles.map((r) => ROLE_LABELS[r] ?? r).join(", ")}</strong>: {total} {total === 1 ? "action" : "actions"} across {groups.length} {groups.length === 1 ? "area" : "areas"}.</p>
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {groups.map(([m, list]) => (
              <li key={m}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{moduleName(m)}</p>
                <p className="break-words text-sm">{list.join(" · ")}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
