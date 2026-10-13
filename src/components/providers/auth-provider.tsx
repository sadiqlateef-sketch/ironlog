"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import type { Tables, UnitSystem } from "@/types/database";

type Profile = Tables<"users">;

interface AuthState {
  /** undefined while we're still reading the saved session. */
  session: Session | null | undefined;
  profile: Profile | null;
  unit: UnitSystem;
  setUnit: (unit: UnitSystem) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loadedProfile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  // Ignore a profile left over from a previous sign-in.
  const profile = loadedProfile && loadedProfile.id === userId ? loadedProfile : null;

  useEffect(() => {
    if (!userId) return;
    getSupabase()
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setProfile(data));
  }, [userId]);

  const setUnit = useCallback(
    async (unit: UnitSystem) => {
      if (!userId) return;
      setProfile((p) => (p ? { ...p, unit_system: unit } : p));
      await getSupabase().from("users").update({ unit_system: unit }).eq("id", userId);
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
  }, []);

  return (
    <AuthContext
      value={{ session, profile, unit: profile?.unit_system ?? "imperial", setUnit, signOut }}
    >
      {children}
    </AuthContext>
  );
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
