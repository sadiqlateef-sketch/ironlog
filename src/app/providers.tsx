"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/components/providers/auth-provider";
import { RestTimerProvider } from "@/components/providers/rest-timer-provider";
import { RationaleHost } from "@/components/rationale-host";
import { syncGymCalendar } from "@/lib/gym";
import { initNative } from "@/lib/native";
import { listenForResetLinks } from "@/lib/password-reset";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    initNative();
  }, []);
  return (
    <AuthProvider>
      <ResetLinks />
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
