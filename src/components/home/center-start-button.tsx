"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { formatElapsed } from "@/components/active-workout-bar";
import { Button } from "@/components/ui/button";
import type { ActiveWorkout } from "@/hooks/use-active-workout";
import { workoutTitle } from "@/lib/labels";
import { getRoutine, startSession, type ProgramProgress } from "@/lib/workout-api";

interface CenterStartButtonProps {
  workout: ActiveWorkout | undefined;
  program: ProgramProgress | null | undefined;
}

export function CenterStartButton({ workout, program }: CenterStartButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live timer for active workout
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!workout) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [workout]);

  async function handleAction() {
    setError(null);

    // If workout in progress, resume immediately
    if (workout) {
      router.push("/workout/");
      return;
    }

    // If active program has next workout, start it
    if (program?.next_routine_id) {
      setBusy(true);
      try {
        await startSession(await getRoutine(program.next_routine_id));
        router.push("/workout/");
      } catch (e) {
        const msg = (e as Error).message;
        setError(msg.includes("one_active") ? "Finish or discard your active session first." : msg);
        setBusy(false);
      }
      return;
    }

    // Default: go to workout logger directly
    router.push("/workout/");
  }

  // In-progress state
  if (workout) {
    const elapsedMs = now - +new Date(workout.session.start_time);
    return (
      <div className="flex flex-col items-center gap-1.5 py-1">
        <Button
          onClick={handleAction}
          size="lg"
          data-testid="center-start-btn"
          className="group relative h-16 w-full max-w-sm rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground">
              <Play className="size-5 fill-current" />
            </span>
            <div className="flex flex-col text-left">
              <span className="leading-tight font-extrabold tracking-tight">Resume Workout</span>
              <span className="text-xs font-medium text-primary-foreground/80 num">
                {workoutTitle(workout.session.name ?? "Workout")} · {formatElapsed(elapsedMs)}
              </span>
            </div>
          </div>
        </Button>
        {error && <p className="text-destructive text-xs font-semibold">{error}</p>}
      </div>
    );
  }

  const nextTitle = program?.next_routine_name
    ? workoutTitle(program.next_routine_name)
    : "Free Workout";
  const subtitle = program?.next_routine_id
    ? `Week ${program.next_week} · Day ${program.next_day}: ${nextTitle}`
    : "Log exercises and track progressive overload";

  return (
    <div className="flex flex-col items-center gap-1.5 py-1">
      <Button
        onClick={handleAction}
        disabled={busy}
        size="lg"
        data-testid="center-start-btn"
        className="group relative h-16 w-full max-w-sm rounded-2xl bg-primary text-primary-foreground text-base font-bold shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-[0.98]"
      >
        <div className="flex items-center justify-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary-foreground/20 text-primary-foreground transition-transform group-hover:scale-110">
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Play className="size-5 fill-current ml-0.5" />
            )}
          </span>
          <div className="flex flex-col text-left">
            <span className="leading-tight font-extrabold tracking-tight">
              {busy ? "Starting Workout…" : "Start Workout"}
            </span>
            <span className="truncate text-xs font-medium text-primary-foreground/80 max-w-[200px]">
              {subtitle}
            </span>
          </div>
        </div>
      </Button>
      {error && <p className="text-destructive text-xs font-semibold">{error}</p>}
    </div>
  );
}
