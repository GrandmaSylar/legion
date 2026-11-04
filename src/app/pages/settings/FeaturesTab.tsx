import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDisabledFeatures, listFeatureCatalogue, setSchoolFeatures, type FeatureDef } from "../../../lib/data/features";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import { FormMessage } from "../../components/fields";

// Quick starting points. Everything else is switched on or off one by one.
const BASIC = ["attendance", "grades", "notices"];

function errorText(e: unknown): string {
  return (e as { message?: string } | null)?.message || "Something went wrong. Please try again.";
}

/** Which parts of the system this school uses. A part that is off disappears for everyone and the database refuses it. */
export default function FeaturesTab() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const canEdit = can("settings.edit");
  const catalogue = useQuery({ queryKey: ["feature-catalogue"], queryFn: listFeatureCatalogue, staleTime: 10 * 60_000 });
  const disabled = useQuery({ queryKey: ["my-disabled-features"], queryFn: getDisabledFeatures });

  const all = catalogue.data ?? [];
  const off = useMemo(() => new Set(disabled.data ?? []), [disabled.data]);
  const labelOf = (key: string) => all.find((f) => f.key === key)?.label ?? key;

  const save = useMutation({
    mutationFn: (on: string[]) => setSchoolFeatures(on),
    onSuccess: () => {
      // What people may do and which parts show both depend on this, so refresh them everywhere.
      void qc.invalidateQueries({ queryKey: ["my-disabled-features"] });
      void qc.invalidateQueries({ queryKey: ["my-capabilities"] });
    },
  });

  const currentOn = all.filter((f) => !off.has(f.key)).map((f) => f.key);

  const toggle = (feature: FeatureDef, turnOn: boolean) => {
    let next = new Set(currentOn);
    if (turnOn) {
      next.add(feature.key);
    } else {
      next.delete(feature.key);
      // Anything that needs this one has to go with it.
      for (const f of all) if (f.requires.includes(feature.key)) next.delete(f.key);
    }
    save.mutate([...next]);
  };

  // A part cannot be switched on while one it needs is off.
  const blockedBy = (f: FeatureDef) => f.requires.filter((r) => off.has(r)).map(labelOf);

  const groups: { title: string; hint: string; items: FeatureDef[] }[] = [
    { title: "Parts of the system", hint: "Switch off what the school does not use. Its menu items, buttons and parents' views disappear.", items: all.filter((f) => f.kind === "module") },
    { title: "Connections", hint: "Ways the system reaches parents and takes money. Each is optional.", items: all.filter((f) => f.kind === "channel") },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">What this school uses</h2>
        <p className="text-sm text-muted-foreground">
          Everything is on to start with. Switching something off hides it for everyone, including parents, and the system stops allowing it. Nothing is deleted: switch it back on and it returns as it was.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Students, users, settings and access are always on.</p>
      </div>

      {catalogue.isLoading || disabled.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {catalogue.isError || disabled.isError ? <p role="alert" className="text-sm text-destructive">The features could not be loaded.</p> : null}

      {canEdit && all.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick starting points">
          <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate(BASIC)}>
            Basic: attendance, grades, notices
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={save.isPending} onClick={() => save.mutate(all.map((f) => f.key))}>
            Everything on
          </Button>
        </div>
      ) : null}
      {!canEdit && all.length > 0 ? <p className="text-xs text-muted-foreground">You can see what is on, but only someone who may change school settings can change it.</p> : null}

      <FormMessage error={save.isError ? errorText(save.error) : null} ok={save.isSuccess ? "Saved. The change takes effect straight away." : null} />

      {groups.map((g) => g.items.length > 0 ? (
        <section key={g.title} className="surface space-y-1 p-4" aria-label={g.title}>
          <h3 className="text-base font-medium">{g.title}</h3>
          <p className="pb-2 text-xs text-muted-foreground">{g.hint}</p>
          <ul className="divide-y divide-border">
            {g.items.map((f) => {
              const isOn = !off.has(f.key);
              const needs = blockedBy(f);
              return (
                <li key={f.key} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <label htmlFor={`feature-${f.key}`} className="block break-words text-sm font-medium">{f.label}</label>
                    <p className="break-words text-xs text-muted-foreground">{f.description}</p>
                    {!isOn && needs.length > 0 ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Switch on {needs.join(" and ")} first.</p> : null}
                  </div>
                  <Switch
                    id={`feature-${f.key}`} checked={isOn}
                    disabled={!canEdit || save.isPending || (!isOn && needs.length > 0)}
                    onCheckedChange={(v) => toggle(f, v)}
                    aria-label={`${f.label}: ${isOn ? "on" : "off"}`}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null)}
    </div>
  );
}
