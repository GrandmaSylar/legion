// Data layer for the term calendar. Row level security decides who sees what: managers see drafts,
// staff see every published event, parents and students see the ones meant for them.
import { supabase } from "../supabase";
import type { CalEvent, EventAudience, EventKind } from "../calendar";

interface Row {
  id: string; title: string; description: string | null; kind: string; starts_on: string; ends_on: string;
  starts_at: string | null; ends_at: string | null; audience: string; published: boolean;
}

const COLUMNS = "id, title, description, kind, starts_on, ends_on, starts_at, ends_at, audience, published";

const fromRow = (r: Row): CalEvent => ({
  id: r.id, title: r.title, description: r.description, kind: r.kind as EventKind, startsOn: r.starts_on, endsOn: r.ends_on,
  startsAt: r.starts_at, endsAt: r.ends_at, audience: r.audience as EventAudience, published: r.published,
});

/** Events that touch any day between the two dates. */
export async function listEvents(from: string, to: string): Promise<CalEvent[]> {
  const { data, error } = await supabase
    .from("calendar_events").select(COLUMNS)
    .lte("starts_on", to).gte("ends_on", from)
    .order("starts_on").order("starts_at", { nullsFirst: true })
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

export interface EventInput {
  title: string;
  description: string;
  kind: EventKind;
  startsOn: string;
  endsOn: string;
  startsAt: string;
  endsAt: string;
  audience: EventAudience;
  published: boolean;
}

function toRow(i: EventInput) {
  return {
    title: i.title.trim(), description: i.description.trim() || null, kind: i.kind, starts_on: i.startsOn, ends_on: i.endsOn,
    starts_at: i.startsAt || null, ends_at: i.startsAt && i.endsAt ? i.endsAt : null, audience: i.audience, published: i.published,
  };
}

export async function createEvent(i: EventInput): Promise<void> {
  const { error } = await supabase.from("calendar_events").insert(toRow(i));
  if (error) throw error;
}

export async function updateEvent(id: string, i: EventInput): Promise<void> {
  const { error } = await supabase.from("calendar_events").update(toRow(i)).eq("id", id);
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  if (error) throw error;
}

/** Copies the events of one stretch of dates to start on another date, as drafts. Returns how many were added. */
export async function copyEvents(fromStart: string, fromEnd: string, toStart: string): Promise<number> {
  const { data, error } = await supabase.rpc("copy_calendar_events", { p_from_start: fromStart, p_from_end: fromEnd, p_to_start: toStart });
  if (error) throw error;
  return Number(data ?? 0);
}

/** Publishes every draft in the dates given and tells staff and parents once. Returns how many were published. */
export async function publishEvents(from: string, to: string): Promise<number> {
  const { data, error } = await supabase.rpc("publish_calendar_events", { p_from: from, p_to: to });
  if (error) throw error;
  return Number(data ?? 0);
}
