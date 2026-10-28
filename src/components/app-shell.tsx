"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ActiveWorkoutBar } from "@/components/active-workout-bar";
import { useAuth } from "@/components/providers/auth-provider";
import { RestTimerBar } from "@/components/rest-timer-bar";
import { LegacyUploadBanner } from "@/components/legacy-upload-banner";
import { SyncBanner } from "@/components/sync-banner";
import { Tour, useTour } from "@/components/tour";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveWorkout } from "@/hooks/use-active-workout";
import { TABS, tabFor } from "@/lib/nav";
import { isLocalBackend } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ReactiveAmbient } from "@/components/ui/reactive-ambient";

/** Signed-in layout: page content, the workout bar, and the bottom tab bar. */
export function AppShell({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const workout = useActiveWorkout();
  const current = tabFor(pathname);
  const onWorkout = current?.href === "/workout/";
  const tour = useTour(profile, pathname);

  useEffect(() => {
    if (session === null) router.replace("/login/");
  }, [session, router]);

  // New account: the welcome steps come first. (No onboarded_at at all means the
  // database hasn't been updated for onboarding yet, so don't send anyone there.)
  const needsWelcome = !!profile && profile.onboarded_at === null && !pathname.startsWith("/welcome");
  useEffect(() => {
    if (needsWelcome) router.replace("/welcome/");
  }, [needsWelcome, router]);

  if (!session) {
    return (
      <div role="status" className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-6">
        <span className="sr-only">Loading…</span>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col relative">
      <ReactiveAmbient />
      {/* Keyed by screen so each one fades in as you switch. Responsively scales for foldable unfolded inner displays. */}
      <main key={pathname} className={cn("page-in mx-auto w-full max-w-md md:max-w-4xl lg:max-w-5xl flex-1 px-4 pt-6 transition-all", workout && !onWorkout ? "pb-48" : "pb-40")}>
        {isLocalBackend() && <p className="text-set-warmup mb-3 text-xs font-semibold">Test mode: not connected to your account</p>}
        {children}
      </main>
      <div className="fixed inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <LegacyUploadBanner />
        <SyncBanner />
        {/* Mid-workout, every other screen shows the workout (and its rest countdown);
            the workout screen has its own dock with the rest countdown inside. */}
        {workout && !onWorkout ? <ActiveWorkoutBar workout={workout} /> : onWorkout ? null : <RestTimerBar />}
        {/* Pages can put a sticky action bar here (the workout's "Log Set"). */}
        <div id="bottom-bar-slot" />
        {/* Tabs step aside during a workout: the logger's dock is the only thing at the bottom. */}
        {!(onWorkout && workout) && (
        <nav className="mx-auto max-w-md md:max-w-xl px-3 pb-3 transition-all" aria-label="Main">
          <ul className="glass-strong grid grid-cols-4 rounded-3xl md:py-1">
            {TABS.map(({ href, label, icon: Icon }) => {
              const active = current?.href === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors",
                      active ? "text-primary-text" : "text-muted-foreground",
                    )}
                  >
                    <Icon className="size-6" strokeWidth={active ? 2.4 : 2} aria-hidden />
                    {label}
                    {href === "/workout/" && workout && !active && (
                      <>
                        <span className="bg-success absolute top-2.5 left-[calc(50%+0.6rem)] size-2 rounded-full" aria-hidden />
                        <span className="sr-only"> (in progress)</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        )}
      </div>
      {tour.open && <Tour onDone={tour.finish} />}
    </div>
  );
}
