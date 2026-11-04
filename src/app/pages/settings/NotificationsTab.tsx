import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDisabledNotificationEvents, listNotificationEvents, setNotificationEvent,
} from "../../../lib/data/notifications";
import { listFeatureCatalogue } from "../../../lib/data/features";
import { useFeatures } from "../../../lib/access/useFeatures";
import { useCapabilities } from "../../../lib/access/useCapabilities";
import { Skeleton } from "../../components/ui/skeleton";
import { Switch } from "../../components/ui/switch";
import { FormMessage } from "../../components/fields";

function errorText(e: unknown): string {
  return (e as { message?: string } | null)?.message || "Something went wrong. Please try again.";
}

/** What the school tells people about automatically, in the bell in the top bar. */
export default function NotificationsTab() {
  const qc = useQueryClient();
  const { can } = useCapabilities();
  const { isOn } = useFeatures();
  const canEdit = can("settings.edit");
  const events = useQuery({ queryKey: ["notification-events"], queryFn: listNotificationEvents, staleTime: 10 * 60_000 });
  const disabled = useQuery({ queryKey: ["notification-disabled"], queryFn: listDisabledNotificationEvents });
  const features = useQuery({ queryKey: ["feature-catalogue"], queryFn: listFeatureCatalogue, staleTime: 10 * 60_000 });
  const off = useMemo(() => new Set(disabled.data ?? []), [disabled.data]);
  const featureLabel = (key: string | null) => features.data?.find((f) => f.key === key)?.label ?? key ?? "";

  const save = useMutation({
    mutationFn: (v: { event: string; enabled: boolean }) => setNotificationEvent(v.event, v.enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notification-disabled"] }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">Automatic notifications</h2>
        <p className="text-sm text-muted-foreground">
          These appear in the bell at the top of the screen for the people they concern, with no one having to send anything.
          Each is on until you switch it off. People who have no login are not reached here; use Messages for them.
        </p>
      </div>
      {!canEdit ? <p className="text-xs text-muted-foreground">Only someone who can change settings can change these.</p> : null}
      <FormMessage error={save.isError ? errorText(save.error) : null} ok={save.isSuccess ? "Saved. The change takes effect straight away." : null} />

      <section className="surface p-4" aria-label="Events">
        {events.isLoading || disabled.isLoading ? <Skeleton className="h-24 w-full" /> : null}
        <ul className="divide-y divide-border">
          {(events.data ?? []).map((e) => {
            const featureOff = e.feature ? !isOn(e.feature) : false;
            const checked = !off.has(e.key) && !featureOff;
            return (
              <li key={e.key} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <label htmlFor={`event-${e.key}`} className="block break-words text-sm font-medium">{e.label}</label>
                  <p className="break-words text-xs text-muted-foreground">{e.description}</p>
                  {featureOff ? <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Off because {featureLabel(e.feature)} is switched off in Features.</p> : null}
                </div>
                <Switch
                  id={`event-${e.key}`} checked={checked} disabled={!canEdit || save.isPending || featureOff}
                  onCheckedChange={(v) => save.mutate({ event: e.key, enabled: v })}
                  aria-label={`${e.label}: ${checked ? "on" : "off"}`}
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
