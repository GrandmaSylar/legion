// The live calendar link: how the address is written, and what to say about it. No imports, so it can be tested alone.

/** The address a phone's calendar app subscribes to. */
export function feedUrl(projectUrl: string, token: string): string {
  return `${projectUrl.replace(/\/+$/, "")}/functions/v1/calendar-feed?t=${token}`;
}

/** The same address as a webcal link, which opens the phone's calendar app directly to subscribe. */
export const webcalUrl = (https: string) => https.replace(/^https?:\/\//, "webcal://");

/** A token is 48 lowercase hex characters, as the function expects. */
export const looksLikeToken = (t: string) => /^[0-9a-f]{48}$/.test(t);

export const FEED_WARNING =
  "Anyone who has this link can read the calendar it shows. Keep it to yourself. If it is shared by mistake, make a new link: the old one stops working at once.";
