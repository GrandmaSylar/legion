// Auth module. The rest of the app uses `useAuth()` and never touches the
// Supabase auth client directly, so the provider can be swapped later.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { AppRole } from "../permissions";

export interface UserThemeConfig {
  mode?: "dark" | "light";
  surface?: "glass" | "flat";
  accent?: string | null;
  wallpaperType?: "preset" | "custom" | "none";
  wallpaperPresetId?: string;
  bgDim?: number;
  bgBlur?: number;
}

export interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  schoolId: string;
  schoolName: string;
  schoolLogoUrl: string | null;
  brandPrimary: string | null;
  isActive: boolean;
  /** Sections the user has switched on; null means everything their role allows. */
  modules: string[] | null;
  theme: UserThemeConfig | null;
}

type Status = "loading" | "signedOut" | "signedIn" | "deactivated";

interface AuthState {
  status: Status;
  profile: Profile | null;
  roles: AppRole[];
  /** True until a user given a temporary password chooses their own. */
  mustChangePassword: boolean;
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Sets a new password and clears the temporary-password flag. Returns an error message, or null. */
  changePassword: (newPassword: string) => Promise<string | null>;
  /** Reloads the current user's profile and school metadata. */
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<{ profile: Profile; roles: AppRole[] } | null> {
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, school_id, is_active, modules, theme, schools(name, logo_url, brand_colors)")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("user_roles").select("role").eq("profile_id", userId),
  ]);
  if (!p) return null;
  const school = Array.isArray(p.schools) ? p.schools[0] : p.schools;
  const brand = (school?.brand_colors ?? {}) as { primary?: string };
  return {
    profile: {
      id: p.id,
      fullName: p.full_name,
      email: p.email,
      schoolId: p.school_id,
      schoolName: school?.name ?? "",
      schoolLogoUrl: school?.logo_url ?? null,
      brandPrimary: brand.primary ?? null,
      isActive: p.is_active,
      modules: (p.modules as string[] | null) ?? null,
      theme: (p.theme as UserThemeConfig | null) ?? null,
    },
    roles: (r ?? []).map((x) => x.role as AppRole),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loaded, setLoaded] = useState<{ profile: Profile; roles: AppRole[] } | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  // Load the profile in a separate effect, not inside the auth callback, which
  // can deadlock if it awaits another Supabase call.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!sessionReady) return;
    if (!userId) {
      setLoaded(null);
      setProfileReady(true);
      return;
    }
    let cancelled = false;
    setProfileReady(false);
    loadProfile(userId).then((result) => {
      if (cancelled) return;
      setLoaded(result);
      setProfileReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionReady, userId]);

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const result = await loadProfile(userId);
    setLoaded(result);
  }, [userId]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? "Incorrect email or password." : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      return /different|same/i.test(error.message)
        ? "Choose a password you have not used before."
        : "The password could not be changed. Try a longer or less common one.";
    }
    // The flag lives in app metadata, which only the server can change.
    const cleared = await supabase.functions.invoke("manage-users", { body: { action: "clear_password_flag" } });
    if (cleared.error) return "Your password was changed, but the account could not be updated. Sign in again.";
    await supabase.auth.refreshSession();
    return null;
  }, []);

  const value = useMemo<AuthState>(() => {
    let status: Status = "loading";
    if (sessionReady && profileReady) {
      if (!session || !loaded) status = "signedOut";
      else status = loaded.profile.isActive ? "signedIn" : "deactivated";
    }
    const mustChangePassword = session?.user.app_metadata?.must_change_password === true;
    return {
      status, profile: loaded?.profile ?? null, roles: loaded?.roles ?? [], mustChangePassword,
      signIn, signOut, changePassword, refreshProfile,
    };
  }, [sessionReady, profileReady, session, loaded, signIn, signOut, changePassword, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
