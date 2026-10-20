"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { RestTimerProvider } from "@/components/providers/rest-timer-provider";
import { RationaleHost } from "@/components/rationale-host";
import { syncGymCalendar } from "@/lib/gym";
import { syncHealthConnect } from "@/lib/health";
import { initNative, onAppActiveChange } from "@/lib/native";
import { applyAppearance, watchSystemTheme } from "@/lib/appearance";
import { listenForBack } from "@/lib/back-button";
import { peekActiveWorkout } from "@/lib/offline/workout-store";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initNative();
    applyAppearance();
    return watchSystemTheme();
  }, []);
  return (
    <AuthProvider>
      <BackButton />
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

/** Android back button / back swipe: closes sheets first, never quits mid-workout (src/lib/back-button.ts). */
function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const ctx = useRef({ pathname, goHome: () => router.replace("/") });
  useEffect(() => {
    ctx.current = { pathname, goHome: () => router.replace("/") };
  }, [pathname, router]);
  useEffect(
    () =>
      listenForBack(() => ({
        ...ctx.current,
        workoutInProgress: () => peekActiveWorkout().then((w) => !!w, () => false),
      })),
    [],
  );
  return null;
}
