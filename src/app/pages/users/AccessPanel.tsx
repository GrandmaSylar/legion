import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { ROLE_LABELS, type AppRole } from "../../../lib/permissions";
import {
  getUserCapabilities, listCapabilityCatalogue, listPresets, setUserCapabilities, type CapabilityDef,
} from "../../../lib/data/access";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { FormMessage, NativeSelect } from "../../components/fields";

const MODULE_NAME: Record<string, string> = {
  students: "Students", attendance: "Attendance", grades: "Grades", fees: "Fees and receipts", expenses: "Expenses",
  analytics: "Analytics", staff: "Staff", messages: "Messages", notices: "Notices", timetable: "Timetable",
  users: "Users", settings: "School settings", access: "Who can do what", audit: "Audit trail",
};

/** Modules the database already decides by these actions. The rest still follow each person's role for now. */
const DECIDED_BY_ACTIONS = new Set(["messages", "access"]);

const PRESET_ROLES: AppRole[] = ["school_admin", "principal", "accountant", "teacher", "hr_officer", "receptionist", "librarian"];

function errorText(e: unknown): string {
  const m = (e as { message?: string } | null)?.message;
  return m || "Something went wrong. Please try again.";
}

export function AccessPanel({ userId, userName, roles }: { userId: string; userName: string; roles: AppRole[] }) {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const catalogue = useQuery({ queryKey: ["access-catalogue"], queryFn: listCapabilityCatalogue, staleTime: 10 * 60_000 });
  const presets = useQuery({ queryKey: ["access-presets"], queryFn: listPresets, staleTime: 10 * 60_000 });
  const current = useQuery({ queryKey: ["user-capabilities", userId], queryFn: () => getUserCapabilities(userId) });

  const [picked, setPicked] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (current.data && picked === null) setPicked(new Set(current.data));
  }, [current.data, picked]);

  const groups = useMemo(() => {
    const m = new Map<string, CapabilityDef[]>();
    for (const c of catalogue.data ?? []) (m.get(c.module) ?? m.set(c.module, []).get(c.module)!).push(c);
    return [...m.entries()];
  }, [catalogue.data]);

  const save = useMutation({
    mutationFn: () => setUserCapabilities(userId, [...(picked ?? [])]),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["user-capabilities", userId] });
      void qc.invalidateQueries({ queryKey: ["my-capabilities"] });
      setPicked(null);
    },
  });

  const toggle = (key: string, on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur ?? []);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  const setAll = (keys: string[], on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur ?? []);
      for (const k of keys) if (on) next.add(k); else next.delete(k);
      return next;
    });

  const startFrom = (role: string) => {
    if (role && presets.data?.[role]) setPicked(new Set(presets.data[role]));
  };

  const loading = catalogue.isLoading || current.isLoading || picked === null;
  const dirty = !!picked && !!current.data && (picked.size !== current.data.length || current.data.some((k) => !picked.has(k)));
  const myJobs = roles.filter((r) => presets.data?.[r]);

  return (
    <section className="surface space-y-4 p-4" aria-labelledby="access-title">
      <div>
        <h2 id="access-title" className="text-base font-medium">What {userName.split(" ")[0]} can do</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Switch on exactly what this person needs, module by module. Where you can only give something you hold yourself, other boxes are greyed out.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Messages and this screen already follow these settings. Other modules still follow the person's role for now and will move over one at a time.
        </p>
      </div>

      {loading ? <Skeleton className="h-32 w-full" /> : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="min-w-0 text-sm">
              <span className="mb-1 block text-xs text-muted-foreground">Start again from a job</span>
              <NativeSelect aria-label="Start again from a job" value="" onChange={(e) => startFrom(e.target.value)}>
                <option value="">Choose a job to copy its access</option>
                {[...new Set([...myJobs, ...PRESET_ROLES])].map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </NativeSelect>
            </label>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPicked(new Set())}>Clear everything</Button>
          </div>

          <div className="space-y-2">
            {groups.map(([module, caps]) => {
              const keys = caps.map((c) => c.key);
              const held = keys.filter((k) => picked!.has(k)).length;
              return (
                <details key={module} className="group rounded-xl border border-border">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 p-3 focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{MODULE_NAME[module] ?? module}</span>
                      {!DECIDED_BY_ACTIONS.has(module) ? <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs text-muted-foreground">Follows role for now</span> : null}
                    </span>
                    <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
                      {held} of {keys.length}
                      <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                    </span>
                  </summary>
                  <div className="space-y-1 border-t border-border p-3">
                    <div className="flex gap-2 pb-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAll(keys.filter((k) => can(k)), true)}>Select all</Button>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setAll(keys, false)}>Clear</Button>
                    </div>
                    {caps.map((c) => {
                      const allowed = can(c.key) || picked!.has(c.key); // you may always take one away
                      return (
                        <label key={c.key} className={`flex min-h-11 items-start gap-3 rounded-lg px-1 py-2 ${allowed ? "cursor-pointer" : "opacity-50"}`}>
                          <input
                            type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]"
                            checked={picked!.has(c.key)} disabled={!can(c.key) && !picked!.has(c.key)}
                            onChange={(e) => toggle(c.key, e.target.checked)}
                          />
                          <span className="min-w-0">
                            <span className="block break-words text-sm">
                              {c.label}
                              {c.sensitive ? <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-800 dark:text-amber-300">Sensitive</span> : null}
                            </span>
                            <span className="block break-words text-xs text-muted-foreground">{c.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>

          <FormMessage error={save.isError ? errorText(save.error) : null} ok={save.isSuccess && !dirty ? "Saved. The change takes effect straight away." : null} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving" : "Save access"}</Button>
            {dirty ? <span className="text-xs text-muted-foreground">You have unsaved changes.</span> : null}
          </div>
        </>
      )}
    </section>
  );
}
