// Theme persistence data layer.
// Syncs a user's theme choices to their profile in Supabase via the set_my_theme RPC.
import { supabase } from "../supabase";
import type { UserThemeConfig } from "../auth/AuthProvider";

export async function saveUserTheme(theme: UserThemeConfig): Promise<void> {
  try {
    const { error } = await supabase.rpc("set_my_theme", { p_theme: theme });
    if (error) {
      // Non-fatal warning (e.g. offline or unauthenticated)
      console.warn("Could not synchronize theme to server:", error.message);
    }
  } catch (e) {
    console.warn("Theme sync exception:", e);
  }
}
