// Decisions for the automatic sender: when a text may go out, and when a queued message is too old to send.
// Pure, with no imports, so it can be tested on its own.

/** Texts go out between 06:00 and 21:00 in Accra, so a parent is not woken by an absence alert in the night. Email goes any time. */
export function withinSendingHours(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Accra" }).format(now));
  return hour >= 6 && hour < 21;
}

/** An automatic message that has waited this long is no longer news (an absence alert the next morning is worse than none). */
export const STALE_AFTER_MS = 36 * 3600 * 1000;

export const isStale = (createdAtIso: string, now: Date) => now.getTime() - Date.parse(createdAtIso) > STALE_AFTER_MS;

/** Compare two secrets without stopping at the first difference. */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
