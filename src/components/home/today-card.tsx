"use client";

// Home's "Today" card: what to train today (resume, the program's next day,
// or a start), and how recovered you are, at a glance.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, CheckCircle2, ChevronRight, Play, Sparkles } from "lucide-react";
import { formatElapsed } from "@/components/active-workout-bar";
import { UpNext } from "@/components/up-next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActiveWorkout } from "@/hooks/use-active-workout";
import { MUSCLE_LABELS, workoutTitle } from "@/lib/labels";
import { computeRecovery, LOOKBACK_HOURS, type MuscleRecovery } from "@/lib/recovery";
import { getMuscleSets, type ProgramProgress, type WorkoutSession } from "@/lib/workout-api";
import { cn } from "@/lib/utils";

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export function TodayCard({
  workout,
  program,
  recent,
  reloadKey,
  onChange,
}: {
  workout: ActiveWorkout | undefined;
  /** undefined while loading */
  program: ProgramProgress | null | undefined;
  recent: WorkoutSession[] | null;
  reloadKey: number;
  /** After something on the card changes your plan (e.g. taking a deload week). */
  onChange?: () => void;
}) {
  const today = new Date();
  const doneToday = recent?.find((s) => s.end_time && sameDay(new Date(s.start_time), today));

  return (
    <Card className="border-primary gap-4 p-4" data-testid="today-card">
      <p className="text-primary-text text-xs font-bold tracking-wide uppercase">
        Today · {today.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
      </p>

      {workout ? (
        <InProgress workout={workout} />
      ) : (
        <>
          {doneToday && (
            <p className="text-success -mt-1 flex items-center gap-1.5 text-sm font-semibold" data-testid="done-today">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              Trained today: {workoutTitle(doneToday.name ?? "Workout")}. Nice work.
            </p>
          )}
          {program === undefined ? (
            <div className="flex flex-col gap-3" role="status">
              <span className="sr-only">Loading…</span>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : program ? (
            <UpNext progress={program} embedded onChange={onChange} />
          ) : (
            <NoProgram />
          )}
        </>
      )}

      <RecoveryStrip reloadKey={reloadKey} />
    </Card>
  );
}

function InProgress({ workout }: { workout: NonNullable<ActiveWorkout> }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        <p className="truncate text-lg font-bold">{workoutTitle(workout.session.name ?? "Workout")}</p>
        <p className="text-muted-foreground text-sm">
          In progress · <span className="text-foreground num font-semibold">{formatElapsed(now - +new Date(workout.session.start_time))}</span>
          {workout.sets > 0 && ` · ${workout.done} of ${workout.sets} sets`}
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/workout/">
          <Play /> Resume workout
        </Link>
      </Button>
    </div>
  );
}

function NoProgram() {
  return (
    <div className="flex flex-col gap-3" data-testid="no-program">
      <div>
        <p className="text-lg font-bold">No program yet</p>
        <p className="text-muted-foreground text-sm">Claude can build one from your goal, equipment and training days. Or just start lifting and log as you go.</p>
      </div>
      <Button asChild size="lg">
        <Link href="/plans/?build=1">
          <Sparkles /> Build my program
        </Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/workout/">
          <Play /> Start a workout
        </Link>
      </Button>
    </div>
  );
}

/** Overall recovery, and the muscles that still need time. */
function RecoveryStrip({ reloadKey }: { reloadKey: number }) {
  const [data, setData] = useState<MuscleRecovery[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => setData(computeRecovery(sets)))
      .catch(() => setFailed(true));
  }, [reloadKey]);
  if (failed) return null;

  // Only muscles you actually worked count toward "how recovered am I".
  const worked = (data ?? []).filter((m) => m.fatigue > 0.05);
  const tired = worked.filter((m) => m.recovery < 90).sort((a, b) => a.recovery - b.recovery);
  const overall = worked.length ? Math.round(worked.reduce((t, m) => t + m.recovery, 0) / worked.length) : 100;

  return (
    <Link href="/progress/" className="bg-secondary flex items-center gap-3 rounded-xl p-3" data-testid="today-recovery">
      {data ? (
        <>
          <Ring value={overall} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{tired.length ? `${overall}% recovered` : "Fully recovered"}</span>
            <span className="text-muted-foreground block truncate text-xs">
              {tired.length
                ? `Still recovering: ${tired
                    .slice(0, 3)
                    .map((m) => `${MUSCLE_LABELS[m.muscle]} ${m.recovery}%`)
                    .join(", ")}`
                : "Every muscle is ready to train hard."}
            </span>
          </span>
          <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
        </>
      ) : (
        <>
          <Activity className="text-muted-foreground size-9 shrink-0" aria-hidden />
          <span className="flex flex-1 flex-col gap-1.5" role="status">
            <span className="sr-only">Loading recovery…</span>
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </span>
        </>
      )}
    </Link>
  );
}

function Ring({ value }: { value: number }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-foreground/15" />
      <circle
        cx="18"
        cy="18"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${(value / 100) * c} ${c}`}
        className={cn(value >= 90 ? "stroke-success" : value >= 60 ? "stroke-chart-1" : "stroke-set-failure")}
      />
    </svg>
  );
}
