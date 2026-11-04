// Pure helpers for staff clock-in: how a flag reads, and the small queue that keeps a scan made with no
// signal until it can be sent. No imports, so it can be tested on its own.

export type ClockFlag = "new_device" | "late" | "offline" | "repeat" | "out_without_in";

export const FLAG_LABELS: Record<ClockFlag, string> = {
  new_device: "New phone",
  late: "Late",
  offline: "Sent later",
  repeat: "Repeated",
  out_without_in: "Out with no in",
};

/** A short plain sentence for a flag, for the person looking at the record. */
export const FLAG_HELP: Record<ClockFlag, string> = {
  new_device: "Clocked in from a phone that has not been approved yet.",
  late: "First clock-in after the start of the day and the grace period.",
  offline: "Scanned with no signal and sent a little later.",
  repeat: "The same direction twice in a row.",
  out_without_in: "Clocked out without clocking in first.",
};

export const flagLabel = (f: string) => FLAG_LABELS[f as ClockFlag] ?? f;

/** "Wed 4 Nov" for a plain YYYY-MM-DD day. */
export function dayText(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** "07:42" in the school's time (Accra), for an instant. */
export function timeText(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Accra" });
}

/** Only the six digits, however they were typed or pasted ("123 456", "123-456"). */
export const cleanCode = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);

export interface QueuedScan { code: string; kind: "in" | "out" | null; capturedAt: string; device: string }

const MAX_AGE_MS = 2 * 24 * 3600 * 1000 - 60_000;

/** Add a scan to the queue, keeping at most 20 and dropping any too old for the database to accept. */
export function enqueue(queue: QueuedScan[], scan: QueuedScan, now: number): QueuedScan[] {
  return prune([...queue, scan], now).slice(-20);
}

/** Scans the database would still accept (it refuses anything over two days old). */
export function prune(queue: QueuedScan[], now: number): QueuedScan[] {
  return queue.filter((s) => {
    const t = Date.parse(s.capturedAt);
    return Number.isFinite(t) && now - t < MAX_AGE_MS && t <= now + 60_000;
  });
}
