import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAutoStatus, listChannelSwitches, listDisabledNotificationEvents, listNotificationEvents, setAutoLimit, setChannelSwitch, setNotificationEvent,
  type AutoChannel,
} from "../../../lib/data/notifications";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
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

  // Text messages and email for the events that can reach parents. Each starts off.
  const switches = useQuery({ queryKey: ["notification-channels"], queryFn: listChannelSwitches });
  const status = useQuery({ queryKey: ["auto-status"], queryFn: getAutoStatus, enabled: canEdit, retry: false });
  const channel = useMutation({
    mutationFn: (v: { event: string; channel: AutoChannel; on: boolean }) => setChannelSwitch(v.event, v.channel, v.on),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["notification-channels"] }); void qc.invalidateQueries({ queryKey: ["notification-disabled"] }); },
  });
  const [limit, setLimit] = useState<string | null>(null);
  const limitValue = limit ?? String(status.data?.dailyLimit ?? 300);
  const limitOk = /^\d+$/.test(limitValue) && Number(limitValue) <= 5000;
  const saveLimit = useMutation({ mutationFn: () => setAutoLimit(Number(limitValue)), onSuccess: () => { setLimit(null); void qc.invalidateQueries({ queryKey: ["auto-status"] }); } });
  const smsOn = isOn("sms");
  const emailOn = isOn("email");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium">Automatic notifications</h2>
        <p className="text-sm text-muted-foreground">
          These appear in the bell at the top of the screen for the people they concern, with no one having to send anything.
          Each is on until you switch it off. Parents who have no login are reached only if you also switch on text message or email for an event, below it; use Messages to write to anyone yourself.
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
              <Fragment key={e.key}>
              <li className="flex items-start justify-between gap-4 py-3">
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
              {e.canMessage && (smsOn || emailOn) ? (
                <li key={`${e.key}-channels`} className="flex flex-wrap items-center gap-x-6 gap-y-1 pb-3 pl-4 text-sm">
                  <span className="text-xs text-muted-foreground">Also send to parents:</span>
                  {smsOn ? (
                    <label className="flex min-h-10 items-center gap-2"><Switch checked={switches.data?.[e.key]?.sms ?? false} disabled={!canEdit || channel.isPending || !checked}
                      onCheckedChange={(v) => channel.mutate({ event: e.key, channel: "sms", on: v })} aria-label={`${e.label}: text message ${switches.data?.[e.key]?.sms ? "on" : "off"}`} />Text message</label>
                  ) : null}
                  {emailOn ? (
                    <label className="flex min-h-10 items-center gap-2"><Switch checked={switches.data?.[e.key]?.email ?? false} disabled={!canEdit || channel.isPending || !checked}
                      onCheckedChange={(v) => channel.mutate({ event: e.key, channel: "email", on: v })} aria-label={`${e.label}: email ${switches.data?.[e.key]?.email ? "on" : "off"}`} />Email</label>
                  ) : null}
                </li>
              ) : null}
              </Fragment>
            );
          })}
        </ul>
      </section>

      {canEdit && (smsOn || emailOn) ? (
        <section className="surface space-y-3 p-4" aria-label="Automatic text messages and email">
          <div>
            <h3 className="text-sm font-semibold">Automatic text messages and email</h3>
            <p className="text-xs text-muted-foreground">
              Text messages cost SMS credit and every one starts off. When one is on, parents are messaged on the phone number or email we hold for them, whether or not they have a login,
              unless they have opted out. A parent never gets the same message twice. Texts are held until 6 in the morning and not sent after 9 at night.
            </p>
          </div>
          {status.data ? (
            <p role="status" className={`text-sm ${status.data.scheduled ? "" : "text-amber-700 dark:text-amber-300"}`}>
              {status.data.scheduled ? "Automatic sending is set up." : "Automatic sending is not set up yet, so messages wait in the queue. Ask whoever looks after the system."}
              {" "}Today: {status.data.sentToday} sent, {status.data.failedToday} failed, {status.data.queued} waiting.
            </p>
          ) : null}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="auto-limit" className="mb-1 block text-xs text-muted-foreground">Most automatic messages a day, for each of text and email</label>
              <Input id="auto-limit" className="w-32" inputMode="numeric" value={limitValue} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <Button type="button" size="sm" disabled={saveLimit.isPending || !limitOk || limit === null} onClick={() => saveLimit.mutate()}>{saveLimit.isPending ? "Saving" : "Save"}</Button>
          </div>
          <p className="text-xs text-muted-foreground">If more would go out in a day, the rest are not sent. This stops a mistake, such as a whole class marked absent by accident, from sending hundreds of texts.</p>
          <FormMessage error={channel.isError ? errorText(channel.error) : saveLimit.isError ? errorText(saveLimit.error) : null} />
        </section>
      ) : null}
    </div>
  );
}
