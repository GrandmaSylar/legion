import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMyThread, listMyComplaints, replyAsComplainant, type MyComplaint } from "../../../lib/data/complaints";
import { STATUS_LABELS, categoryLabel, isOpen } from "../../../lib/complaints";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { FormMessage } from "../../components/fields";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Thread({ complaint, onClose }: { complaint: MyComplaint; onClose: () => void }) {
  const qc = useQueryClient();
  const thread = useQuery({ queryKey: ["my-complaint-thread", complaint.id], queryFn: () => getMyThread(complaint.id) });
  const [text, setText] = useState("");
  const send = useMutation({
    mutationFn: () => replyAsComplainant(complaint.id, text),
    onSuccess: () => { setText(""); void qc.invalidateQueries({ queryKey: ["my-complaint-thread", complaint.id] }); void qc.invalidateQueries({ queryKey: ["my-complaints"] }); },
  });
  const open = complaint.status !== "closed";
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="break-words">{complaint.subject}</DialogTitle>
        <DialogDescription>{complaint.ref} · {categoryLabel(complaint.category)} · {STATUS_LABELS[complaint.status]}{complaint.anonymous ? " · sent anonymously" : ""}</DialogDescription>
      </DialogHeader>
      <div className="rounded-xl bg-foreground/5 p-3 text-sm"><p className="mb-1 text-xs text-muted-foreground">You wrote on {when(complaint.createdAt)}</p><p className="whitespace-pre-wrap break-words">{complaint.body}</p></div>
      {thread.isLoading ? <Skeleton className="h-12 w-full" /> : null}
      <ul className="space-y-2">
        {(thread.data ?? []).map((m) => (
          <li key={m.id} className={`rounded-xl p-3 text-sm ${m.fromHandler ? "border border-primary/30 bg-primary/5" : "bg-foreground/5"}`}>
            <p className="mb-1 text-xs text-muted-foreground">{m.fromHandler ? "The school" : "You"} · {when(m.createdAt)}</p>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
          </li>
        ))}
      </ul>
      {open ? (
        <div className="space-y-2">
          <label htmlFor="mc-reply" className="text-sm font-medium">Write a reply</label>
          <Textarea id="mc-reply" rows={3} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
        </div>
      ) : <p className="text-sm text-muted-foreground">This complaint is closed. If you still need help, send a new one.</p>}
      <FormMessage error={send.isError ? friendlyError(send.error) : null} />
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        {open ? <Button type="button" disabled={send.isPending || !text.trim()} onClick={() => send.mutate()}>{send.isPending ? "Sending" : "Send reply"}</Button> : null}
      </DialogFooter>
    </div>
  );
}

/** The complaints the signed-in person has raised, with the school's replies. */
export function MineTab() {
  const list = useQuery({ queryKey: ["my-complaints"], queryFn: listMyComplaints, staleTime: 10_000 });
  const [open, setOpen] = useState<MyComplaint | null>(null);
  if (list.isLoading) return <Skeleton className="h-20 w-full" />;
  if (list.isError) return <p role="alert" className="surface p-4 text-sm">Your complaints could not be loaded.</p>;
  if (!list.data || list.data.length === 0) return <p className="surface p-6 text-center text-sm text-muted-foreground">You have not sent any complaints.</p>;
  return (
    <>
      <ul className="grid gap-2">
        {list.data.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setOpen(c)} className="surface flex min-h-14 w-full items-start justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{c.subject}</span>
                <span className="block text-xs text-muted-foreground">{c.ref} · {categoryLabel(c.category)} · {when(c.createdAt)}{c.anonymous ? " · anonymous" : ""}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${isOpen(c.status) ? "bg-sky-500/15 text-sky-800 dark:text-sky-200" : "bg-foreground/10 text-muted-foreground"}`}>{STATUS_LABELS[c.status]}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">{open ? <Thread key={open.id} complaint={open} onClose={() => setOpen(null)} /> : null}</DialogContent>
      </Dialog>
    </>
  );
}
