"use client";

import { useEffect, type ReactNode } from "react";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { RestTimerProvider } from "@/components/providers/rest-timer-provider";
import { syncGymCalendar } from "@/lib/gym";
import { initNative } from "@/lib/native";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initNative();
  }, []);
  return (
    <AuthProvider>
      <GymCalendarCatchUp />
      <RestTimerProvider>{children}</RestTimerProvider>
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
