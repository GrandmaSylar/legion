import { useQuery } from "@tanstack/react-query";
import { listReveals } from "../../../lib/data/complaints";
import { Skeleton } from "../../components/ui/skeleton";

/** Developer only: every time someone looked behind an anonymous complaint, and why. It never holds the name. */
export function RevealLog() {
  const log = useQuery({ queryKey: ["complaint-reveals"], queryFn: listReveals });
  return (
    <div className="space-y-3">
      <p className="max-w-prose text-sm text-muted-foreground">Each time the person behind an anonymous complaint was looked up, with the reason given. The name is never kept here.</p>
      {log.isLoading ? <Skeleton className="h-16 w-full" /> : null}
      {log.data && log.data.length === 0 ? <p className="surface p-6 text-center text-sm text-muted-foreground">Nobody has been revealed.</p> : null}
      <ul className="grid gap-2">
        {(log.data ?? []).map((r) => (
          <li key={r.id} className="surface space-y-1 p-3 text-sm">
            <p className="break-words font-medium">{r.ref} · {r.subject}</p>
            <p className="text-xs text-muted-foreground">{new Date(r.at).toLocaleString("en-GB", { timeZone: "Africa/Accra" })} · by {r.revealedBy ?? "someone"}</p>
            <p className="break-words">{r.reason}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
