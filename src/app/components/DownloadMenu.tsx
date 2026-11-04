import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useCapabilities } from "../../lib/access/useCapabilities";
import { downloadTable, FORMAT_LABELS, type ExportFormat, type ExportTable } from "../../lib/export/tableExport";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

const ORDER: ExportFormat[] = ["xlsx", "csv", "pdf", "png", "jpeg"];

/**
 * A Download button that offers Excel, CSV, PDF, PNG and JPEG. It shows only to someone who holds the
 * module's download action (for example "fees.download"), so a screen they may view is not always one
 * they may take away. `getTable` is called when a format is chosen, so it always reflects what is on screen.
 * This only decides what to show: it is a convenience, not a lock on data the person can already read.
 */
export function DownloadMenu({
  action, getTable, formats = ORDER, label = "Download", disabled, className,
}: {
  action: string;
  getTable: () => ExportTable | Promise<ExportTable>;
  formats?: ExportFormat[];
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { can } = useCapabilities();
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!can(action)) return null;

  const run = async (f: ExportFormat) => {
    setBusy(f);
    setError(null);
    try {
      await downloadTable(await getTable(), f);
    } catch {
      setError("The file could not be made. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm" disabled={disabled || busy !== null} aria-label={label}>
            {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Download className="size-3.5" aria-hidden />}
            {busy ? "Preparing" : label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          {formats.map((f) => (
            <DropdownMenuItem key={f} className="min-h-11 flex-col items-start gap-0" onSelect={() => void run(f)}>
              <span className="text-sm font-medium">{FORMAT_LABELS[f].label}</span>
              <span className="text-xs text-muted-foreground">{FORMAT_LABELS[f].hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? <span role="alert" className="ml-2 text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
