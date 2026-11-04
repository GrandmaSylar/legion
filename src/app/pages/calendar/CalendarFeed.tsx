import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarSync, Copy } from "lucide-react";
import { createFeed, getFeedStatus, revokeFeed } from "../../../lib/data/calendarFeed";
import { FEED_WARNING, webcalUrl } from "../../../lib/calendarFeed";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { FormMessage } from "../../components/fields";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });

/** A secret link a phone's calendar can subscribe to, so changes appear without downloading a file again. */
export function CalendarFeed() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["calendar-feed"], queryFn: getFeedStatus, staleTime: 10_000, retry: false });
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = useMutation({ mutationFn: createFeed, onSuccess: (url) => { setLink(url); setCopied(false); void qc.invalidateQueries({ queryKey: ["calendar-feed"] }); } });
  const stop = useMutation({ mutationFn: revokeFeed, onSuccess: () => { setLink(null); void qc.invalidateQueries({ queryKey: ["calendar-feed"] }); } });
  const copy = async () => { try { await navigator.clipboard.writeText(link ?? ""); setCopied(true); } catch { setCopied(false); } };

  return (
    <Dialog onOpenChange={(v) => { if (!v) { setLink(null); make.reset(); } }}>
      <DialogTrigger asChild><Button type="button" size="sm" variant="outline"><CalendarSync className="size-4" aria-hidden /> Phone calendar</Button></DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keep your phone&apos;s calendar up to date</DialogTitle>
          <DialogDescription>Add this calendar to your phone once, and new and changed events appear by themselves. Your phone checks about once an hour.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {status.data?.exists && !link ? (
            <p className="rounded-xl bg-foreground/5 p-3 text-sm">You already have a link{status.data.createdAt ? `, made ${when(status.data.createdAt)}` : ""}. {status.data.lastUsedAt ? `Your phone last looked at it ${when(status.data.lastUsedAt)}.` : "No phone has used it yet."} For safety it cannot be shown again: make a new one if you need to add another phone.</p>
          ) : null}
          {link ? (
            <div className="space-y-2" role="status">
              <label htmlFor="cf-link" className="text-sm font-medium">Your link</label>
              <div className="flex gap-2"><Input id="cf-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="min-w-0" /><Button type="button" variant="outline" onClick={() => void copy()}><Copy className="size-4" aria-hidden /> {copied ? "Copied" : "Copy"}</Button></div>
              <Button type="button" asChild><a href={webcalUrl(link)}>Add to my phone&apos;s calendar</a></Button>
              <p className="text-xs text-muted-foreground">Or paste the link into your calendar app under &quot;Add calendar from URL&quot; (Google Calendar) or &quot;Add Subscribed Calendar&quot; (Apple).</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{FEED_WARNING} Only events that have been published are included, and only the ones you are allowed to see.</p>
          <FormMessage error={make.isError ? friendlyError(make.error) : stop.isError ? friendlyError(stop.error) : null} />
        </div>
        <DialogFooter className="gap-2">
          {status.data?.exists ? <Button type="button" variant="ghost" className="text-destructive" disabled={stop.isPending} onClick={() => stop.mutate()}>Stop my link</Button> : null}
          <Button type="button" disabled={make.isPending} onClick={() => make.mutate()}>{make.isPending ? "Making it" : status.data?.exists ? "Make a new link" : "Make my link"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
