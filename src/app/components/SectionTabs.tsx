import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "./ui/sheet";
import { cn } from "./ui/utils";

export interface SectionItem {
  value: string;
  label: string;
  /** A quiet number beside the label, such as how many invoices there are. */
  count?: number;
  /** A loud number for things waiting on someone, such as payments to review. Hidden at zero. */
  alert?: number;
}

/**
 * Sections inside a screen. On a phone it is one line, always: a button showing the current section
 * that opens a list to choose from, so a long list of sections never wraps over several rows. On a
 * larger screen it is one row of tabs that scrolls sideways inside itself instead of wrapping.
 * The content of each section goes inside as <TabsContent value="…">.
 */
export function SectionTabs({
  items, defaultValue, value: controlled, onValueChange, label = "Section", className, children,
}: {
  items: SectionItem[];
  defaultValue?: string;
  /** Set both of these to let the parent choose the section (for example to move on after a form is sent). */
  value?: string;
  onValueChange?: (value: string) => void;
  /** What the phone list is called, for example "Section" or "Show". */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const first = items[0]?.value ?? "";
  const [own, setOwn] = useState(defaultValue ?? first);
  const picked = controlled ?? own;
  const setPicked = (v: string) => { setOwn(v); onValueChange?.(v); };
  const [open, setOpen] = useState(false);
  // If the chosen section has gone (an action was switched off), fall back to the first.
  const value = items.some((i) => i.value === picked) ? picked : first;
  const current = items.find((i) => i.value === value);

  const badge = (i: SectionItem) => (
    <>
      {i.count !== undefined ? <span className="text-xs tabular-nums text-muted-foreground">{i.count}</span> : null}
      {i.alert ? <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold tabular-nums text-white">{i.alert}</span> : null}
    </>
  );

  return (
    <Tabs value={value} onValueChange={setPicked} className={className}>
      {/* Phone: a single line that opens the list */}
      <div className="sm:hidden">
        <button
          type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`${label}: ${current?.label ?? ""}. Change`}
          className="surface flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <span className="min-w-0">
            <span className="block text-xs text-muted-foreground">{label}</span>
            <span className="block break-words text-sm font-semibold">{current?.label}</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {current ? badge(current) : null}
            <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
          </span>
        </button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-2xl pb-6">
            <SheetHeader>
              <SheetTitle>{label}</SheetTitle>
              <SheetDescription className="sr-only">Choose which {label.toLowerCase()} to show.</SheetDescription>
            </SheetHeader>
            <ul className="px-2">
              {items.map((i) => (
                <li key={i.value}>
                  <button
                    type="button" aria-current={i.value === value}
                    onClick={() => { setPicked(i.value); setOpen(false); }}
                    className={cn(
                      "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
                      i.value === value ? "bg-primary/10 font-semibold" : "hover:bg-foreground/5",
                    )}
                  >
                    <span className="min-w-0 break-words">{i.label}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {badge(i)}
                      {i.value === value ? <Check className="size-4 text-primary" aria-hidden /> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>
      </div>

      {/* Larger screens: one row of tabs, scrolling inside itself rather than wrapping */}
      <TabsList className="hidden h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto sm:flex">
        {items.map((i) => (
          <TabsTrigger key={i.value} value={i.value} className="flex-none px-3 py-1.5">
            {i.label}
            {badge(i)}
          </TabsTrigger>
        ))}
      </TabsList>

      {children}
    </Tabs>
  );
}
