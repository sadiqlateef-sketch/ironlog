"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { RestTimerProvider } from "@/components/providers/rest-timer-provider";
import { RationaleHost } from "@/components/rationale-host";
import { syncGymCalendar } from "@/lib/gym";
import { syncHealthConnect } from "@/lib/health";
import { initNative, onAppActiveChange } from "@/lib/native";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initNative();
  }, []);
  return (
    <AuthProvider>
      <GymCalendarCatchUp />
      <HealthConnectCatchUp />
      <RestTimerProvider>{children}</RestTimerProvider>
      <RationaleHost />
    </AuthProvider>
  );
}

/**
 * Once per app start: put gym workouts on the calendar that weren't added
 * when they finished (ended on the watch, or the phone was offline).
 */
function GymCalendarCatchUp() {
  const { profile } = useAuth();
  const userId = profile?.gym_lat != null ? profile.id : null;
  useEffect(() => {
    if (userId) syncGymCalendar();
  }, [userId]);
  return null;
}

/**
 * Health Connect, when it's on: catch up at app start and whenever the app
 * comes back to the front (a watch workout, a weigh-in on the scale...).
 */
function HealthConnectCatchUp() {
  const { profile, unit } = useAuth();
  const userId = profile?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    syncHealthConnect(unit);
    return onAppActiveChange((active) => {
      if (active) syncHealthConnect(unit);
    });
  }, [userId, unit]);
  return null;
}
