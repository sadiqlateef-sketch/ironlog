"use client";

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { cachedRead } from "@/lib/offline/cache";
import { kvClear, kvSet } from "@/lib/offline/kv";
import { discardPending, flush, getSyncStatus } from "@/lib/offline/queue";
import type { Tables, UnitSystem } from "@/types/database";

type Profile = Tables<"users">;

interface AuthState {
  /** undefined while we're still reading the saved session. */
  session: Session | null | undefined;
  profile: Profile | null;
  unit: UnitSystem;
  setUnit: (unit: UnitSystem) => Promise<void>;
  /** Save profile settings (bar, plates, rest time...) and update them here. */
  updateProfile: (patch: Partial<Pick<Profile, "bar_weight_kg" | "available_plates_kg" | "default_rest_seconds" | "display_name" | "physical_stats" | "gym_name" | "gym_lat" | "gym_lng" | "gym_radius_m" | "unit_system" | "training_goal" | "training_equipment" | "training_days_per_week" | "onboarded_at">>) => Promise<void>;
  signOut: () => Promise<void>;
}

/** Profile columns added by recent migrations, skipped when the database is behind the app. */
const NEWER_COLUMNS = ["training_goal", "training_equipment", "training_days_per_week", "onboarded_at"];

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
    // Kept on the phone too, so the app opens (and logs workouts) without signal.
    cachedRead(`profile:${userId}`, async () => {
      const { data, error } = await getSupabase().from("users").select("*").eq("id", userId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    })
      .then(setProfile)
      .catch(() => {});
  }, [userId]);

  const setUnit = useCallback(
    async (unit: UnitSystem) => {
      if (!userId) return;
      setProfile((p) => (p ? { ...p, unit_system: unit } : p));
      await getSupabase().from("users").update({ unit_system: unit }).eq("id", userId);
    },
    [userId],
  );

  const updateProfile = useCallback<AuthState["updateProfile"]>(
    async (patch) => {
      if (!userId) return;
      let { data, error } = await getSupabase().from("users").update(patch).eq("id", userId).select().single();
      // A column the live database doesn't have yet (the app updated before the
      // database did): save the rest instead of failing the whole thing.
      const missing = error?.message.match(/Could not find the '(\w+)' column/)?.[1];
      if (missing && missing in patch) {
        const rest = Object.fromEntries(Object.entries(patch).filter(([k]) => !NEWER_COLUMNS.includes(k))) as typeof patch;
        if (!Object.keys(rest).length) return;
        ({ data, error } = await getSupabase().from("users").update(rest).eq("id", userId).select().single());
      }
      if (error || !data) throw new Error(error?.message ?? "Couldn't save");
      setProfile(data);
      void kvSet(`cache:profile:${userId}`, data);
    },
    [userId],
  );

  const signOut = useCallback(async () => {
    // Send any workout changes still waiting for signal before they're forgotten.
    if (!(await flush())) {
      const n = getSyncStatus().pending;
      if (n > 0 && !confirm(`${n} workout ${n === 1 ? "change hasn't" : "changes haven't"} synced yet. Sign out anyway and lose ${n === 1 ? "it" : "them"}?`)) return;
    }
    await getSupabase().auth.signOut();
    await discardPending();
    await kvClear();
  }, []);

  return (
    <AuthContext
      value={{ session, profile, unit: profile?.unit_system ?? "imperial", setUnit, updateProfile, signOut }}
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
