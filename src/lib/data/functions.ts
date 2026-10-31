// Calls to our Edge Functions. A function answers failures with { error: "..." }
// and a status code; turn that into an Error carrying the readable message.
import { supabase } from "../supabase";

export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = "Something went wrong. Please try again.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        /* keep the generic message */
      }
    }
    throw new Error(message);
  }
  return (data ?? {}) as T;
}
