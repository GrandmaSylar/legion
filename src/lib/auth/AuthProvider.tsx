// Auth module. The rest of the app uses `useAuth()` and never touches the
// Supabase auth client directly, so the provider can be swapped later.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { AppRole } from "../permissions";

export interface Profile {
  id: string;
  fullName: string;
  email: string | null;
  schoolId: string;
  schoolName: string;
  brandPrimary: string | null;
}

type Status = "loading" | "signedOut" | "signedIn";

interface AuthState {
  status: Status;
  profile: Profile | null;
  roles: AppRole[];
  /** Returns an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function loadProfile(userId: string): Promise<{ profile: Profile; roles: AppRole[] } | null> {
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email, school_id, schools(name, brand_colors)")
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
      brandPrimary: brand.primary ?? null,
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

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? "Incorrect email or password." : null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(() => {
    let status: Status = "loading";
    if (sessionReady && profileReady) status = session && loaded ? "signedIn" : "signedOut";
    return { status, profile: loaded?.profile ?? null, roles: loaded?.roles ?? [], signIn, signOut };
  }, [sessionReady, profileReady, session, loaded, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
