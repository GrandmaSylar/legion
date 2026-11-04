import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { listEvents } from "../../../lib/data/calendar";
import { overlaps, type ListStyle } from "../../../lib/calendar";
import {
  downloadIcs, downloadList, downloadPicture, type CalendarFile, type ListFormat, type PictureFormat,
} from "../../../lib/export/calendarExport";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../../components/ui/dialog";
import { Field, FormMessage, NativeSelect } from "../../components/fields";
import { cn } from "../../components/ui/utils";

export interface Scope { id: string; label: string; from: string; to: string }

type How = "list" | "picture" | "phone";

function Choice<T extends string>({ name, value, onChange, options }: {
  name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={name} className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}
          className={cn(
            "min-h-12 rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
            o.value === value ? "border-primary bg-primary/10" : "border-border hover:bg-foreground/5",
          )}
        >
          <span className="block font-medium">{o.label}</span>
          {o.hint ? <span className="block text-xs text-muted-foreground">{o.hint}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * Download the calendar the way the person wants it: a list of events (bulleted or numbered), a picture
 * of the month grids, or a file for their phone's calendar. Shown only to someone who may download it.
 */
export function CalendarDownload({
  scopes, defaultScope, schoolName, canSeeDrafts,
}: { scopes: Scope[]; defaultScope: string; schoolName: string; canSeeDrafts: boolean }) {
  const [open, setOpen] = useState(false);
  const [scopeId, setScopeId] = useState(defaultScope);
  const [how, setHow] = useState<How>("list");
  const [style, setStyle] = useState<ListStyle>("bullets");
  const [listFormat, setListFormat] = useState<ListFormat>("pdf");
  const [pictureFormat, setPictureFormat] = useState<PictureFormat>("png");
  const [drafts, setDrafts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  const scope = scopes.find((s) => s.id === scopeId) ?? scopes[0];

  const run = async () => {
    if (!scope) return;
    setBusy(true); setError(null); setEmpty(false);
    try {
      const all = await listEvents(scope.from, scope.to);
      const events = all.filter((e) => overlaps(e, scope.from, scope.to) && (drafts || e.published));
      if (events.length === 0) { setEmpty(true); return; }
      const file: CalendarFile = { title: `${scope.label} calendar`, subtitle: schoolName, events, from: scope.from, to: scope.to };
      if (how === "list") await downloadList(file, style, listFormat);
      else if (how === "picture") await downloadPicture(file, pictureFormat);
      else downloadIcs(file);
      setOpen(false);
    } catch {
      setError("The file could not be made. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (scopes.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm"><Download className="size-3.5" aria-hidden /> Download</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Download the calendar</DialogTitle>
          <DialogDescription>Choose what to include and how you would like it.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="What to include" htmlFor="cal-scope">
            <NativeSelect id="cal-scope" value={scope?.id ?? ""} onChange={(e) => setScopeId(e.target.value)}>
              {scopes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </NativeSelect>
          </Field>

          <div className="space-y-2">
            <p className="text-sm font-medium">How</p>
            <Choice<How> name="How" value={how} onChange={setHow} options={[
              { value: "list", label: "A list of events", hint: "Each event with its dates, in date order" },
              { value: "picture", label: "A picture of the calendar", hint: "The month grids, to print or share" },
              { value: "phone", label: "For my phone's calendar", hint: "A file your calendar app can open (.ics)" },
            ]} />
          </div>

          {how === "list" ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-medium">Style</p>
                <Choice<ListStyle> name="Style" value={style} onChange={setStyle} options={[
                  { value: "bullets", label: "Bulleted", hint: "• 11 Nov: Open day" },
                  { value: "numbers", label: "Numbered", hint: "1. 11 Nov: Open day" },
                ]} />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">File</p>
                <Choice<ListFormat> name="File" value={listFormat} onChange={setListFormat} options={[
                  { value: "pdf", label: "PDF" }, { value: "txt", label: "Text file" }, { value: "xlsx", label: "Excel", hint: "A table, not a list" },
                ]} />
              </div>
            </>
          ) : null}

          {how === "picture" ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">File</p>
              <Choice<PictureFormat> name="File" value={pictureFormat} onChange={setPictureFormat} options={[
                { value: "png", label: "PNG image" }, { value: "jpeg", label: "JPEG image" }, { value: "pdf", label: "PDF", hint: "One month to a page" },
              ]} />
            </div>
          ) : null}

          {canSeeDrafts ? (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} />
              Include drafts that are not published yet
            </label>
          ) : null}
          {empty ? <p role="status" className="text-sm text-muted-foreground">There are no events to include for that choice.</p> : null}
          <FormMessage error={error} />
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="button" disabled={busy || !scope} onClick={() => void run()}>
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />} {busy ? "Preparing" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
