// The live calendar link. The database makes the secret, keeps only a hash of it and decides what the feed holds.
import { supabase } from "../supabase";
import { feedUrl } from "../calendarFeed";

export interface FeedStatus { exists: boolean; createdAt?: string; lastUsedAt?: string | null }

export async function getFeedStatus(): Promise<FeedStatus> {
  const { data, error } = await supabase.rpc("calendar_feed_status");
  if (error) throw error;
  return data as FeedStatus;
}

/** Makes a new link (cancelling any old one) and returns its address. The secret is not kept anywhere readable, so this is the only time it is seen. */
export async function createFeed(): Promise<string> {
  const { data, error } = await supabase.rpc("create_calendar_feed");
  if (error) throw error;
  return feedUrl(import.meta.env.VITE_SUPABASE_URL as string, data as string);
}

export async function revokeFeed(): Promise<void> {
  const { error } = await supabase.rpc("revoke_calendar_feed");
  if (error) throw error;
}
