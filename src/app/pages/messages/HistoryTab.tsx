import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import {
  AUDIENCE_LABELS, continueBatch, listBatches, listMessages, refreshDelivery, retryFailed,
  type BatchRow, type MessageStatus,
} from "../../../lib/data/messaging";
import { Button } from "../../components/ui/button";
import { Skeleton } from "../../components/ui/skeleton";
import { DownloadMenu } from "../../components/DownloadMenu";
import { FormMessage } from "../../components/fields";
import { cn } from "../../components/ui/utils";
import { useMessagingRights } from "./useMessagingRights";

const STATUS_STYLE: Record<MessageStatus, string> = {
  queued: "bg-foreground/10 text-muted-foreground",
  sending: "bg-foreground/10 text-muted-foreground",
  sent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  delivered: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-foreground/10 text-muted-foreground",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

function BatchDetail({ batch }: { batch: BatchRow }) {
  const qc = useQueryClient();
  const { feeOnly } = useMessagingRights();
  const messages = useQuery({ queryKey: ["messages", batch.id], queryFn: () => listMessages(batch.id) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["messages", batch.id] });
    void qc.invalidateQueries({ queryKey: ["message-batches"] });
  };
  const check = useMutation({ mutationFn: () => refreshDelivery(batch.id), onSuccess: refresh });
  const rest = useMutation({ mutationFn: () => continueBatch(batch.id), onSuccess: refresh });
  const retry = useMutation({
    mutationFn: async () => {
      const r = await retryFailed(batch.id);
      if (r.requeued > 0) await continueBatch(batch.id);
      return r;
    },
    onSuccess: refresh,
  });

  const error = check.error ?? rest.error ?? retry.error;
  return (
    <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap gap-2">
        {!batch.sandbox ? (
          <Button size="sm" variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? "Checking" : "Check delivery"}
          </Button>
        ) : null}
        {batch.queued > 0 ? (
          <Button size="sm" variant="outline" disabled={rest.isPending} onClick={() => rest.mutate()}>
            {rest.isPending ? "Sending" : `Send the ${batch.queued} waiting`}
          </Button>
        ) : null}
        {batch.failed > 0 && !feeOnly ? (
          <Button size="sm" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate()}>
            {retry.isPending ? "Retrying" : "Retry failed"}
          </Button>
        ) : null}
        <DownloadMenu
          action="messages.download" label="Download this list" disabled={!messages.data?.length}
          getTable={() => ({
            title: "Messages sent", filename: "messages",
            columns: ["Recipient", "Phone", "Message", "Parts", "Status", "Problem", "Sent"],
            rows: (messages.data ?? []).map((m) => [m.recipientName ?? "", m.phone, m.body, m.segments, m.status, m.error ?? "", m.sentAt ?? ""]),
          })}
        />
      </div>
      <FormMessage error={error ? errorText(error) : null} ok={check.isSuccess ? `${check.data.delivered} delivered, ${check.data.failed} failed so far.` : retry.isSuccess ? `${retry.data.requeued} queued again.` : null} />

      {messages.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {messages.isError ? <p role="alert" className="text-sm text-destructive">The messages could not be loaded.</p> : null}
      <ul className="divide-y divide-border">
        {messages.data?.map((m) => (
          <li key={m.id} className="space-y-1 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="break-words font-medium">{m.recipientName || m.phone}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLE[m.status])}>{m.status}</span>
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">{m.recipientName ? `${m.phone} · ` : ""}{m.segments} {m.segments === 1 ? "part" : "parts"}</div>
            <p className="whitespace-pre-wrap break-words text-muted-foreground">{m.body}</p>
            {m.error ? <p role="alert" className="text-xs text-destructive">{m.error}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HistoryTab() {
  const batches = useQuery({ queryKey: ["message-batches"], queryFn: () => listBatches(50) });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {batches.isError ? <p role="alert" className="text-sm text-destructive">The history could not be loaded.</p> : null}
      {batches.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {batches.data?.length === 0 ? (
        <section className="surface p-6 text-sm text-muted-foreground">Nothing has been sent yet. Messages you send appear here with their delivery status.</section>
      ) : null}

      {batches.data?.map((b) => (
        <section key={b.id} className="surface space-y-3 p-4">
          <button
            type="button" aria-expanded={open === b.id} onClick={() => setOpen(open === b.id ? null : b.id)}
            className="flex w-full items-start justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="break-words text-sm font-medium">{b.title}</span>
                {b.sandbox ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">Dry run</span> : null}
              </span>
              <span className="block text-xs text-muted-foreground">{AUDIENCE_LABELS[b.audience]} · {when(b.createdAt)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {b.total} total
                <span className="block">
                  {b.delivered ? `${b.delivered} delivered ` : ""}{b.sent ? `${b.sent} sent ` : ""}{b.queued ? `${b.queued} waiting ` : ""}{b.failed ? `${b.failed} failed` : ""}
                </span>
              </span>
              <ChevronDown className={cn("size-4 transition-transform", open === b.id && "rotate-180")} aria-hidden />
            </span>
          </button>
          {open === b.id ? <BatchDetail batch={b} /> : null}
        </section>
      ))}
    </div>
  );
}
