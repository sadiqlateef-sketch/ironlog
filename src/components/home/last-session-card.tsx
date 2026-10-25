"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Dumbbell, Flame, Heart, Sparkles, Timer, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MUSCLE_LABELS, workoutTitle } from "@/lib/labels";
import { formatWeight, type UnitSystem } from "@/lib/units";
import {
  listExercises,
  listSessionSets,
  type Exercise,
  type WorkoutSession,
  type WorkoutSet,
} from "@/lib/workout-api";

interface LastSessionCardProps {
  session: WorkoutSession | null | undefined;
  unit: UnitSystem;
  onOpen: (id: string) => void;
}

export function LastSessionCard({ session, unit, onOpen }: LastSessionCardProps) {
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!session?.id) return;
    void Promise.resolve().then(() => setLoading(true));

    Promise.all([listSessionSets(session.id), listExercises()])
      .then(([setsData, exerciseList]) => {
        setSets(setsData);
        setExercises(new Map(exerciseList.map((e) => [e.id, e])));
      })
      .catch((err) => console.warn("Failed loading last session sets:", err))
      .finally(() => setLoading(false));
  }, [session?.id]);

  if (session === undefined) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-6 w-48" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </Card>
    );
  }

  if (!session) {
    return (
      <Card className="flex flex-col gap-2 border-dashed p-4 text-center">
        <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Last Session</p>
        <p className="text-base font-bold">No sessions logged yet</p>
        <p className="text-muted-foreground text-xs">
          Complete your first workout to see volume, PR highlights, and muscle stimulus debriefs here.
        </p>
      </Card>
    );
  }

  // Calculate metrics
  const completedSets = sets.filter((s) => s.is_completed);
  const workingSets = completedSets.filter((s) => s.set_type !== "warmup");
  const durationMin = session.end_time
    ? Math.max(1, Math.round((+new Date(session.end_time) - +new Date(session.start_time)) / 60000))
    : null;

  // Find top set by absolute weight or e1RM
  let topSet: { exerciseName: string; weight: number; reps: number } | null = null;
  let maxWeight = 0;
  for (const s of workingSets) {
    if (s.weight > maxWeight) {
      maxWeight = s.weight;
      const ex = exercises.get(s.exercise_id);
      topSet = {
        exerciseName: ex?.name ?? "Lift",
        weight: s.weight,
        reps: s.reps,
      };
    }
  }

  // Find unique muscles worked
  const musclesWorked = new Set<string>();
  for (const s of completedSets) {
    const ex = exercises.get(s.exercise_id);
    if (ex?.primary_muscle) {
      musclesWorked.add(MUSCLE_LABELS[ex.primary_muscle] || ex.primary_muscle);
    }
  }

  const sessionDate = new Date(session.start_time);
  const isToday = sessionDate.toDateString() === new Date().toDateString();
  const dateLabel = isToday
    ? "Earlier Today"
    : sessionDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <Card
      data-testid="last-session-card"
      onClick={() => onOpen(session.id)}
      className="group relative cursor-pointer border-border/70 p-4 transition-all hover:border-primary/60 hover:shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary-text inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase">
            <Trophy className="size-3" /> Last Session Debrief
          </span>
          <span className="text-muted-foreground text-xs">{dateLabel}</span>
        </div>
        <ChevronRight className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-2 min-w-0">
        <h2 className="truncate text-lg font-bold tracking-tight">{workoutTitle(session.name ?? "Workout")}</h2>
      </div>

      {/* 3-Column Metric Matrix */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="bg-secondary/70 flex flex-col rounded-xl p-2.5 text-center">
          <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Volume</span>
          <span className="num text-base font-bold text-foreground">
            {formatWeight(session.volume, unit)}
          </span>
        </div>
        <div className="bg-secondary/70 flex flex-col rounded-xl p-2.5 text-center">
          <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Working Sets</span>
          <span className="num text-base font-bold text-foreground">
            {workingSets.length > 0 ? `${workingSets.length} sets` : `${completedSets.length} sets`}
          </span>
        </div>
        <div className="bg-secondary/70 flex flex-col rounded-xl p-2.5 text-center">
          <span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-wider">Time</span>
          <span className="num text-base font-bold text-foreground">
            {durationMin ? `${durationMin} min` : "—"}
          </span>
        </div>
      </div>

      {/* Top Set PR / Highlight */}
      {topSet && (
        <div className="bg-primary/5 border-primary/20 mt-3 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
          <Sparkles className="text-primary size-3.5 shrink-0" />
          <span className="truncate">
            <strong className="text-foreground font-semibold">{topSet.exerciseName}:</strong>{" "}
            <span className="num font-bold text-primary-text">{formatWeight(topSet.weight, unit)}</span> ×{" "}
            <span className="num font-bold">{topSet.reps} reps</span> (Top Set)
          </span>
        </div>
      )}

      {/* Target Stimulus / Muscles Worked */}
      {musclesWorked.size > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground text-[11px] font-medium">Stimulus:</span>
          {Array.from(musclesWorked)
            .slice(0, 4)
            .map((m) => (
              <span
                key={m}
                className="bg-secondary text-secondary-foreground rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              >
                {m}
              </span>
            ))}
        </div>
      )}
    </Card>
  );
}
