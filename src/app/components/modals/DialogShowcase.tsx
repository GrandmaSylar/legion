import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "../ui/button";
import { useActionDialog } from "./ActionDialogContext";
import { LegionCrest } from "../brand/LegionCrest";

/**
 * Interactive Dialog & Modal Showcase component.
 * Demonstrates the system's dialogue, confirmation, and prompt windows
 * matching the active theme (Dark/Light/AMOLED/Glass/Flat).
 */
export function DialogShowcase() {
  const { confirm, prompt, alert } = useActionDialog();
  const [lastAction, setLastAction] = useState<string | null>(null);

  async function handleDestructiveDemo() {
    const ok = await confirm({
      title: "Delete Class 9-Gold?",
      description: "This will remove the class section and unlink all 34 enrolled student records. This operation cannot be reversed.",
      variant: "destructive",
      confirmText: "Delete Section",
      confirmationPhrase: "DELETE",
      details: (
        <div className="space-y-1">
          <div className="font-semibold text-foreground">Entity: Basic 9 - Gold Stream</div>
          <div>Students affected: 34 active pupils</div>
          <div>Term records: Term 1, Term 2, Term 3 grades archived</div>
        </div>
      ),
    });
    setLastAction(ok ? "Confirmed: Class 9-Gold deleted (destructive)" : "Cancelled: Deletion aborted");
  }

  async function handleWarningDemo() {
    const ok = await confirm({
      title: "Archive 2025/2026 Academic Calendar?",
      description: "Archiving this academic year will lock all report cards and transition active rosters to read-only status for auditing.",
      variant: "warning",
      confirmText: "Archive Calendar",
    });
    setLastAction(ok ? "Confirmed: Academic calendar archived" : "Cancelled: Calendar archive aborted");
  }

  async function handleSuccessAnnouncementDemo() {
    await alert({
      title: "WAEC BECE Candidates Registered",
      message: "Successfully generated 48 official 10-digit WAEC candidate index numbers with verified core subjects and birth dates.",
      type: "success",
      buttonText: "Review Candidate Roster",
    });
    setLastAction("Acknowledged: WAEC registration success window");
  }

  async function handlePromptDemo() {
    const reason = await prompt({
      title: "Reject Expense Claim #EXP-084",
      description: "Provide an audit trail note explaining why this payment voucher was rejected by the administration.",
      label: "Reason for rejection",
      placeholder: "e.g., Missing original VAT receipt or unauthorized budget overrun…",
      required: true,
      multiline: true,
    });
    if (reason !== null) {
      setLastAction(`Submitted rejection reason: "${reason}"`);
    } else {
      setLastAction("Cancelled: Prompt dismissed without saving");
    }
  }

  async function handleFastConfirmDemo() {
    const ok = await confirm({
      title: "Publish Term 2 Report Cards?",
      description: "All parents with linked accounts will immediately receive SMS and portal access to their ward's terminal grades.",
      variant: "info",
      confirmText: "Publish to Portal",
    });
    setLastAction(ok ? "Confirmed: Report cards published" : "Cancelled: Publish postponed");
  }

  return (
    <div className="surface space-y-4 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <LegionCrest size={28} />
          <div>
            <h3 className="text-sm font-semibold text-foreground">System Dialogue & Confirmation Windows</h3>
            <p className="text-xs text-muted-foreground">
              Theme-aware accessible modals with backdrop blur, focus trapping, and keyboard ergonomics.
            </p>
          </div>
        </div>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          Accessible Modals
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
          onClick={() => void handleDestructiveDemo()}
        >
          <ShieldAlert className="size-3.5" aria-hidden />
          <span>Destructive</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
          onClick={() => void handleWarningDemo()}
        >
          <AlertTriangle className="size-3.5" aria-hidden />
          <span>Warning</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
          onClick={() => void handleFastConfirmDemo()}
        >
          <AlertCircle className="size-3.5" aria-hidden />
          <span>Action Confirm</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start gap-1.5"
          onClick={() => void handlePromptDemo()}
        >
          <HelpCircle className="size-3.5" aria-hidden />
          <span>Input Prompt</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="justify-start gap-1.5 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10"
          onClick={() => void handleSuccessAnnouncementDemo()}
        >
          <CheckCircle2 className="size-3.5" aria-hidden />
          <span>Success Alert</span>
        </Button>
      </div>

      {lastAction ? (
        <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-foreground/[0.02] px-3 py-2 text-xs text-muted-foreground font-mono">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          <span>Last Window Result:</span>
          <span className="font-semibold text-foreground truncate">{lastAction}</span>
        </div>
      ) : null}
    </div>
  );
}
