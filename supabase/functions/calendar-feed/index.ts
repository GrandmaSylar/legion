// calendar-feed: serves a person's live calendar as an .ics feed a phone can subscribe to.
//
// The link is  <project>/functions/v1/calendar-feed?t=<token>. There is no login: the secret token in the
// link is the only credential, so this function is deployed WITHOUT gateway JWT verification:
//   supabase functions deploy calendar-feed --use-api --no-verify-jwt
// The token is hashed here and looked up in the database, which decides what that person may see (the same
// rules as the calendar screen, published events only) and returns it. An unknown, replaced or cancelled
// token, or one whose owner can no longer see the calendar, gets the same plain 404 as any other, so a
// guess learns nothing. No secrets of its own: it uses the project's own URL and service key.
//
// calendar.ts here is a byte-for-byte copy of src/lib/calendar.ts (a test enforces it), so the feed and the
// downloaded file are built by the same code.
import { createClient } from "npm:@supabase/supabase-js@2";
import { toIcs, type CalEvent } from "./calendar.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const notFound = () => new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
  const token = new URL(req.url).searchParams.get("t") ?? "";
  // Tokens are 48 hex characters. Anything else cannot be one, so do not even ask the database.
  if (!/^[0-9a-f]{48}$/.test(token)) return notFound();

  const { data, error } = await admin.rpc("calendar_feed_for_token", { p_hash: await sha256Hex(token) });
  if (error) { console.error("calendar feed failed", error.message); return new Response("Try again later", { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!data) return notFound();

  const feed = data as { school: string | null; events: CalEvent[] };
  let ics = toIcs(feed.events, `${feed.school ?? "School"} calendar`);
  // Ask calendar apps to look again about every hour.
  ics = ics.replace("CALSCALE:GREGORIAN", "CALSCALE:GREGORIAN\r\nREFRESH-INTERVAL;VALUE=DURATION:PT1H\r\nX-PUBLISHED-TTL:PT1H");
  return new Response(req.method === "HEAD" ? null : ics, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=900", "Content-Disposition": 'inline; filename="calendar.ics"' },
  });
});
