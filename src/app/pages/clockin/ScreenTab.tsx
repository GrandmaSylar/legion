import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2 } from "lucide-react";
import { getCurrentCode } from "../../../lib/data/clockin";
import { friendlyError } from "../../../lib/data/errors";
import { Button } from "../../components/ui/button";

/** The fixed screen at the gate or the office: the code, as numbers and as a QR code that opens the app. */
export function ScreenTab() {
  const code = useQuery({
    queryKey: ["clockin-code"], queryFn: getCurrentCode, retry: 1,
    // Ask again a moment after the code runs out; the server says how long is left.
    refetchInterval: (q) => ((q.state.data?.expiresIn ?? 5) * 1000) + 400,
    refetchIntervalInBackground: true, staleTime: 0, gcTime: 0,
  });
  const [now, setNow] = useState(() => Date.now());
  const [qr, setQr] = useState<{ code: string; url: string } | null>(null);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  const shown = code.data?.code;
  useEffect(() => {
    if (!shown) return;
    let live = true;
    void import("qrcode").then((m) => m.toDataURL(`${window.location.origin}/clockin?c=${shown}`, { margin: 1, width: 360, errorCorrectionLevel: "M" }))
      .then((url) => { if (live) setQr({ code: shown, url }); }).catch(() => { /* the numbers still work */ });
    return () => { live = false; };
  }, [shown]);

  const left = code.data ? Math.max(0, Math.ceil(code.data.expiresIn - (now - code.dataUpdatedAt) / 1000)) : 0;
  const fullscreen = () => { void document.getElementById("clockin-screen")?.requestFullscreen?.().catch(() => undefined); };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-prose text-sm text-muted-foreground">Leave this open on a screen at the gate or the office. Staff type the code, or scan the square with their phone&apos;s camera.</p>
        <Button type="button" size="sm" variant="outline" onClick={fullscreen}><Maximize2 className="size-4" aria-hidden /> Full screen</Button>
      </div>
      <section id="clockin-screen" aria-label="Clock-in code" className="surface flex flex-col items-center gap-4 bg-background p-6 text-center sm:p-10">
        {code.isError ? <p role="alert" className="text-sm">{friendlyError(code.error)}</p> : null}
        {shown ? (
          <>
            <p aria-live="off" className="text-6xl font-semibold tabular-nums tracking-[0.15em] sm:text-8xl">{shown.slice(0, 3)} {shown.slice(3)}</p>
            <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-label="Time left on this code" aria-valuemin={0} aria-valuemax={30} aria-valuenow={left}>
              <div className="h-full bg-primary transition-[width] duration-500 ease-linear" style={{ width: `${Math.min(100, (left / (code.data?.windowSeconds ?? 30)) * 100)}%` }} />
            </div>
            <p className="text-sm tabular-nums text-muted-foreground">Changes in {left} seconds</p>
            {qr && qr.code === shown ? <img src={qr.url} alt="Square code that opens clock-in on a phone" width={240} height={240} className="size-48 rounded-xl bg-white p-2 sm:size-60" /> : <div className="size-48 rounded-xl bg-foreground/5 sm:size-60" aria-hidden />}
          </>
        ) : !code.isError ? <p className="text-sm text-muted-foreground">Getting the code</p> : null}
      </section>
    </div>
  );
}
