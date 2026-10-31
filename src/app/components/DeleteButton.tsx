import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./ui/button";

/**
 * A delete that asks first, in place (no browser dialog). The caller decides who
 * sees it; the database independently refuses anyone who is not allowed, and
 * refuses records that still have history.
 */
export function DeleteButton({
  what, onConfirm, pending, error, label = "Delete",
}: { what: string; onConfirm: () => void; pending: boolean; error?: string | null; label?: string }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {!confirming ? (
        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
          <Trash2 className="size-4" aria-hidden /> {label}
        </Button>
      ) : (
        <>
          <span className="text-sm">Delete {what}?</span>
          <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Deleting" : "Yes, delete"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
        </>
      )}
      {error ? <span role="alert" className="basis-full text-sm text-destructive">{error}</span> : null}
    </span>
  );
}
