"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronUp, SkipForward } from "lucide-react";
import type { ActiveWorkout } from "@/hooks/use-active-workout";
import { useRestTimer } from "@/components/providers/rest-timer-provider";
import { workoutTitle } from "@/lib/labels";
import { formatClock } from "@/lib/workout-logic";
import { cn } from "@/lib/utils";

/** 1:05:09 or 12:34. */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * The workout in progress, pinned above the tabs on every other screen:
 * its name, how long you've been going, and the rest countdown. Tap to go back to it.
 */
export function ActiveWorkoutBar({ workout }: { workout: NonNullable<ActiveWorkout> }) {
  const { timer, remaining, stop } = useRestTimer();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const resting = !!timer && remaining > 0;
  const restDone = !!timer && remaining <= 0;
  const elapsed = formatElapsed(now - +new Date(workout.session.start_time));
  const name = workoutTitle(workout.session.name ?? "Workout");

  return (
    <div
      data-testid="active-workout-bar"
      className={cn(
        "relative mx-3 mb-2 overflow-hidden rounded-2xl sm:mx-auto sm:max-w-md md:max-w-xl transition-all",
        restDone ? "bg-primary text-primary-foreground" : "glass-strong",
      )}
    >
      {resting && (
        <div
          aria-hidden
          className="bg-primary/25 absolute inset-y-0 left-0 transition-[width] duration-300 ease-linear"
          style={{ width: `${Math.min(1, remaining / timer.duration) * 100}%` }}
        />
      )}
      <div className="relative flex items-center">
        <Link href="/workout/" className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-2 pl-4" aria-label={`Back to your workout: ${name}`}>
          <span className="relative flex size-2.5 shrink-0" aria-hidden>
            <span className={cn("absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping", restDone ? "bg-primary-foreground" : "bg-success")} />
            <span className={cn("relative inline-flex size-2.5 rounded-full", restDone ? "bg-primary-foreground" : "bg-success")} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block truncate text-xs", !restDone && "text-muted-foreground")}>
              {restDone ? "Rest over. Next set!" : resting ? `Resting · ${name}` : `${name}${workout.sets ? ` · ${workout.done} of ${workout.sets} sets` : ""}`}
            </span>
            <span className="block num text-xl leading-tight font-extrabold tracking-tight" role={resting ? "timer" : undefined}>
              {resting ? formatClock(remaining) : elapsed}
            </span>
          </span>
          {!resting && !restDone && <ChevronUp className="text-muted-foreground size-5 shrink-0" aria-hidden />}
        </Link>
        {timer && (
          <button type="button" onClick={stop} aria-label="Skip rest" className="grid size-12 shrink-0 place-items-center">
            <SkipForward className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
