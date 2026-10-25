"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { RestTimerProvider } from "@/components/providers/rest-timer-provider";
import { RationaleHost } from "@/components/rationale-host";
import { syncGymCalendar } from "@/lib/gym";
import { initNative } from "@/lib/native";
import { listenForResetLinks } from "@/lib/password-reset";
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
      <ResetLinks />
      <BackButton />
      <GymCalendarCatchUp />
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

/** A tapped "reset password" email link opens the sign-in screen's new-password step. */
function ResetLinks() {
  const router = useRouter();
  useEffect(() => listenForResetLinks(() => router.replace("/login/")), [router]);
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
