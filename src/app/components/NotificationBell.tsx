import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { listNotifications, markAllRead, markRead, type AppNotification } from "../../lib/data/notifications";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

function ago(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  for (const [unit, size] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** Only follow links that stay inside the app. */
function safeLink(link: string | null): string | null {
  return link && link.startsWith("/") && !link.startsWith("//") ? link : null;
}

/**
 * The bell in the top bar. It shows what has happened for this person (a notice, a payment, an absence,
 * report cards) and checks again every minute. Nothing here can be edited: a person can only read
 * their own and mark them read.
 */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(30),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
    retry: false,
  });
  const items = list.data ?? [];
  const unread = items.filter((n) => !n.readAt).length;

  const refresh = () => void qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: markRead, onSuccess: refresh });
  const readAll = useMutation({ mutationFn: markAllRead, onSuccess: refresh });

  const go = (n: AppNotification) => {
    if (!n.readAt) read.mutate(n.id);
    setOpen(false);
    const to = safeLink(n.link);
    if (to) navigate(to);
  };

  const label = unread > 0 ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button" aria-label={label} title="Notifications"
          className="relative grid size-9 place-items-center rounded-full border border-border bg-foreground/5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 ? (
            <span aria-hidden className="absolute -right-1 -top-1 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <h2 className="text-sm font-semibold">Notifications</h2>
          <button
            type="button" disabled={unread === 0 || readAll.isPending} onClick={() => readAll.mutate()}
            className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            Mark all read
          </button>
        </div>
        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto">
          {list.isError ? <p role="alert" className="p-4 text-sm text-muted-foreground">Notifications could not be loaded.</p> : null}
          {!list.isError && !list.isLoading && items.length === 0 ? (
            <div className="grid place-items-center gap-2 p-8 text-center text-sm text-muted-foreground">
              <BellOff className="size-5" aria-hidden />
              Nothing yet. Notices, payments and other news will appear here.
            </div>
          ) : null}
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button" onClick={() => go(n)}
                  className={cn("flex min-h-12 w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-[var(--ring)]", !n.readAt && "bg-primary/5")}
                >
                  <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block break-words text-sm", !n.readAt && "font-semibold")}>{n.title}</span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block break-words text-xs text-muted-foreground">{n.body}</span> : null}
                    <span className="mt-1 block text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
