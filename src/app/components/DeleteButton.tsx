import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { ActionConfirmDialog } from "./modals/ActionConfirmDialog";

export interface DeleteButtonProps {
  what: string;
  onConfirm: () => void | Promise<void>;
  pending: boolean;
  error?: string | null;
  label?: string;
  requirePhrase?: boolean;
}

/**
 * A sleek delete trigger that opens a theme-matching confirmation dialog window.
 * Protects users from accidental irreversible deletions while maintaining
 * clean table/card layouts without disruptive inline reflows.
 */
export function DeleteButton({
  what,
  onConfirm,
  pending,
  error,
  label = "Delete",
  requirePhrase = false,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false);

  async function handleConfirm() {
    await onConfirm();
  }

  return (
    <>
      <span className="inline-flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive"
          onClick={() => setOpen(true)}
          disabled={pending}
        >
          <Trash2 className="size-4" aria-hidden />
          <span>{label}</span>
        </Button>
        {error ? (
          <span role="alert" className="text-xs text-destructive">
            {error}
          </span>
        ) : null}
      </span>

      <ActionConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${what}?`}
        description={`Are you sure you want to delete ${what}? This action cannot be reversed and may impact related historical records.`}
        variant="destructive"
        confirmText={pending ? "Deleting…" : "Delete permanently"}
        cancelText="Cancel"
        loading={pending}
        confirmationPhrase={requirePhrase ? "DELETE" : undefined}
        onConfirm={handleConfirm}
      />
    </>
  );
}
