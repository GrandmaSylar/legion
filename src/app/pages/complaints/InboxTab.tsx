import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import {
  assignComplaint, getHistory, getThread, handlerReply, listComplaints, listHandlers, revealSubmitter, setComplaintStatus,
  type Complaint, type Revealed,
} from "../../../lib/data/complaints";
import { CATEGORIES, HANDLER_STATUS_LABELS, categoryLabel, isOpen, type ComplaintStatus } from "../../../lib/complaints";
import { friendlyError } from "../../../lib/data/errors";
import { useAuth } from "../../../lib/auth/AuthProvider";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { Skeleton } from "../../components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { FormMessage, NativeSelect } from "../../components/fields";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });
const STATUSES = Object.keys(HANDLER_STATUS_LABELS) as ComplaintStatus[];

/** Developer only: look behind an anonymous complaint, with a written reason that is logged. */
function Reveal({ complaint }: { complaint: Complaint }) {
  const qc = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [shown, setShown] = useState<Revealed | null>(null);
  const reveal = useMutation({
    mutationFn: () => revealSubmitter(complaint.id, reason),
    onSuccess: (r) => { setShown(r); setAsking(false); void qc.invalidateQueries({ queryKey: ["complaint-history", complaint.id] }); void qc.invalidateQueries({ queryKey: ["complaint-reveals"] }); },
  });
  if (shown) return <p role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">Sent by <strong>{shown.name}</strong>{shown.email ? ` (${shown.email})` : ""}{shown.roles.length ? `, ${shown.roles.join(", ")}` : ""}. This was recorded.</p>;
  if (!asking) return <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}><ShieldAlert className="size-4" aria-hidden /> Reveal who sent this</Button>;
  return (
    <div className="space-y-2 rounded-xl border border-amber-500/40 p-3">
      <p className="text-sm">Anonymity is a promise to the person who sent this. Use this only in a serious case, such as a threat to someone&apos;s safety or the misuse of anonymity. Your reason and the fact you looked are recorded where the school&apos;s handlers can see them. It will not say who it was.</p>
      <label htmlFor="rv-reason" className="text-sm font-medium">Why do you need to know? (at least 10 characters)</label>
      <Textarea id="rv-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      <FormMessage error={reveal.isError ? friendlyError(reveal.error) : null} />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="destructive" disabled={reveal.isPending || reason.trim().length < 10} onClick={() => reveal.mutate()}>{reveal.isPending ? "Looking" : "Reveal and record it"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
      </div>
    </div>
  );
}

function Detail({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isDeveloper = roles.includes("developer");
  const thread = useQuery({ queryKey: ["complaint-thread", complaint.id], queryFn: () => getThread(complaint.id) });
  const history = useQuery({ queryKey: ["complaint-history", complaint.id], queryFn: () => getHistory(complaint.id) });
  const handlers = useQuery({ queryKey: ["complaint-handlers", complaint.id], queryFn: () => listHandlers(complaint.id), staleTime: 60_000 });
  const [text, setText] = useState("");
  const [priv, setPriv] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["complaints"] }); void qc.invalidateQueries({ queryKey: ["complaint-thread", complaint.id] }); void qc.invalidateQueries({ queryKey: ["complaint-history", complaint.id] }); };
  const reply = useMutation({ mutationFn: () => handlerReply(complaint.id, text, priv), onSuccess: () => { setText(""); refresh(); } });
  const status = useMutation({ mutationFn: (s: ComplaintStatus) => setComplaintStatus(complaint.id, s), onSuccess: refresh });
  const assign = useMutation({ mutationFn: (p: string | null) => assignComplaint(complaint.id, p), onSuccess: refresh });
  const err = reply.isError ? friendlyError(reply.error) : status.isError ? friendlyError(status.error) : assign.isError ? friendlyError(assign.error) : null;
  // The list the screen holds can be a moment behind; show the freshest status it has.
  const current = useQuery({ queryKey: ["complaints"], queryFn: listComplaints, staleTime: 5_000 }).data?.find((c) => c.id === complaint.id) ?? complaint;

  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle className="break-words">{complaint.subject}</DialogTitle>
        <DialogDescription>{complaint.ref} · {categoryLabel(complaint.category)} · {when(complaint.createdAt)}</DialogDescription>
      </DialogHeader>
      <p className="text-sm"><strong>From:</strong> {complaint.anonymous ? "Anonymous. You are not shown who sent it." : complaint.submitterName ?? "Someone whose account has been removed"}</p>
      <div className="rounded-xl bg-foreground/5 p-3 text-sm"><p className="whitespace-pre-wrap break-words">{complaint.body}</p></div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="cd-status" className="mb-1 block text-xs text-muted-foreground">Status</label>
          <NativeSelect id="cd-status" value={current.status} disabled={status.isPending} onChange={(e) => status.mutate(e.target.value as ComplaintStatus)}>
            {STATUSES.map((s) => <option key={s} value={s}>{HANDLER_STATUS_LABELS[s]}</option>)}
          </NativeSelect></div>
        <div><label htmlFor="cd-assign" className="mb-1 block text-xs text-muted-foreground">Looked after by</label>
          <NativeSelect id="cd-assign" value={current.assignedTo ?? ""} disabled={assign.isPending} onChange={(e) => assign.mutate(e.target.value || null)}>
            <option value="">Nobody yet</option>{(handlers.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </NativeSelect></div>
      </div>

      <section aria-label="Conversation" className="space-y-2">
        <h3 className="text-sm font-semibold">Conversation</h3>
        {thread.isLoading ? <Skeleton className="h-10 w-full" /> : null}
        {thread.data && thread.data.length === 0 ? <p className="text-sm text-muted-foreground">No replies yet.</p> : null}
        <ul className="space-y-2">
          {(thread.data ?? []).map((m) => (
            <li key={m.id} className={`rounded-xl p-3 text-sm ${m.internal ? "border border-dashed border-amber-500/50 bg-amber-500/5" : m.fromHandler ? "border border-primary/30 bg-primary/5" : "bg-foreground/5"}`}>
              <p className="mb-1 text-xs text-muted-foreground">{m.internal ? "Private note" : m.fromHandler ? "Reply to them" : "From the complainant"} · {m.authorName ?? (m.fromHandler ? "" : complaint.anonymous ? "anonymous" : complaint.submitterName ?? "")} · {when(m.createdAt)}</p>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="space-y-2">
        <label htmlFor="cd-reply" className="text-sm font-medium">{priv ? "Private note (the complainant will not see it)" : "Reply to the complainant"}</label>
        <Textarea id="cd-reply" rows={3} value={text} maxLength={4000} onChange={(e) => setText(e.target.value)} />
        <label className="flex min-h-10 items-center gap-3 text-sm"><input type="checkbox" className="size-5 accent-[var(--primary)]" checked={priv} onChange={(e) => setPriv(e.target.checked)} />Keep this as a private note for the team</label>
      </div>
      <FormMessage error={err} />
      {complaint.anonymous && isDeveloper ? <Reveal complaint={complaint} /> : null}

      <details className="text-sm"><summary className="cursor-pointer font-medium">What has been done</summary>
        <ul className="mt-2 space-y-1">
          {(history.data ?? []).map((h, i) => <li key={i} className="break-words text-xs text-muted-foreground">{when(h.at)} · {h.actorName ?? "Someone"} {h.action}{h.detail ? `: ${h.detail}` : ""}</li>)}
          {history.data && history.data.length === 0 ? <li className="text-xs text-muted-foreground">Nothing yet.</li> : null}
        </ul>
      </details>
      <DialogFooter className="gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        <Button type="button" disabled={reply.isPending || !text.trim()} onClick={() => reply.mutate()}>{reply.isPending ? "Saving" : priv ? "Add note" : "Send reply"}</Button>
      </DialogFooter>
    </div>
  );
}

/** For those who handle complaints: every complaint they may see, with the conversation, status and who has it. */
export function InboxTab() {
  const list = useQuery({ queryKey: ["complaints"], queryFn: listComplaints, staleTime: 10_000 });
  const [show, setShow] = useState<"open" | "done" | "all">("open");
  const [cat, setCat] = useState("");
  const [open, setOpen] = useState<Complaint | null>(null);
  const rows = useMemo(() => (list.data ?? []).filter((c) => (show === "all" || (show === "open" ? isOpen(c.status) : !isOpen(c.status))) && (!cat || c.category === cat)), [list.data, show, cat]);
  const fresh = (list.data ?? []).filter((c) => c.status === "new").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-2">
          {([["open", `Open${fresh ? ` (${fresh} new)` : ""}`], ["done", "Resolved and closed"], ["all", "Everything"]] as const).map(([v, label]) => (
            <button key={v} type="button" role="radio" aria-checked={show === v} onClick={() => setShow(v)}
              className={`min-h-10 rounded-full border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-[var(--ring)] ${show === v ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5"}`}>{label}</button>
          ))}
        </div>
        <div className="w-full sm:w-56"><NativeSelect aria-label="Kind" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All kinds</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</NativeSelect></div>
      </div>
      {list.isLoading ? <Skeleton className="h-20 w-full" /> : null}
      {list.isError ? <p role="alert" className="surface p-4 text-sm">Complaints could not be loaded.</p> : null}
      {list.data && rows.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">{show === "open" ? "No open complaints." : "Nothing here."}</p> : null}
      <ul className="grid gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setOpen(c)} className="surface flex min-h-14 w-full items-start justify-between gap-3 p-3 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{c.category === "safeguarding" ? <ShieldAlert className="mr-1 inline size-4 text-amber-600" aria-label="Safeguarding" /> : null}{c.subject}</span>
                <span className="block break-words text-xs text-muted-foreground">{c.ref} · {categoryLabel(c.category)} · {c.anonymous ? "Anonymous" : c.submitterName ?? "Account removed"} · {c.assignedName ? `with ${c.assignedName}` : "nobody yet"}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${c.status === "new" ? "bg-sky-500/15 text-sky-800 dark:text-sky-200" : "bg-foreground/10 text-muted-foreground"}`}>{HANDLER_STATUS_LABELS[c.status]}</span>
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={!!open} onOpenChange={(v) => { if (!v) setOpen(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">{open ? <Detail key={open.id} complaint={open} onClose={() => setOpen(null)} /> : null}</DialogContent>
      </Dialog>
    </div>
  );
}
