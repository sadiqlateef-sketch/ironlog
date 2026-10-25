"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, CheckCircle2, ChevronRight, Dumbbell, Sparkles, Target, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MUSCLE_LABELS, workoutTitle } from "@/lib/labels";
import { computeRecovery, LOOKBACK_HOURS, type MuscleRecovery } from "@/lib/recovery";
import { formatWeight, type UnitSystem } from "@/lib/units";
import { useOverloadSettings } from "@/lib/overload-settings";
import { calculatePeriodizedTarget, getPhaseForWeek } from "@/lib/periodization";
import {
  getMuscleSets,
  getRoutineTargets,
  listExercises,
  type Exercise,
  type ProgramProgress,
  type RoutineExercise,
} from "@/lib/workout-api";

interface NextSessionCardProps {
  program: ProgramProgress | null | undefined;
  unit: UnitSystem;
}

export function NextSessionCard({ program, unit }: NextSessionCardProps) {
  const { settings } = useOverloadSettings();
  const [targets, setTargets] = useState<RoutineExercise[]>([]);
  const [exercises, setExercises] = useState<Map<string, Exercise>>(new Map());
  const [recovery, setRecovery] = useState<MuscleRecovery[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 1. Fetch muscle recovery
    getMuscleSets(new Date(Date.now() - LOOKBACK_HOURS * 3_600_000))
      .then((sets) => setRecovery(computeRecovery(sets)))
      .catch(() => {});

    // 2. Fetch exercise catalog & routine targets
    listExercises()
      .then((exList) => setExercises(new Map(exList.map((e) => [e.id, e]))))
      .catch(() => {});

    if (program?.next_routine_id) {
      void Promise.resolve().then(() => setLoading(true));
      getRoutineTargets(program.next_routine_id)
        .then(setTargets)
        .catch((err) => console.warn("Failed loading routine targets:", err))
        .finally(() => setLoading(false));
    } else {
      void Promise.resolve().then(() => setTargets([]));
    }
  }, [program?.next_routine_id]);

  if (program === undefined) {
    return (
      <Card className="flex flex-col gap-3 p-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </Card>
    );
  }

  // No active program state
  if (!program || !program.next_routine_id) {
    return (
      <Card className="flex flex-col gap-3 border-dashed p-4" data-testid="next-session-card">
        <div className="flex items-center justify-between">
          <span className="bg-secondary text-muted-foreground inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase">
            <Target className="size-3" /> Next Session Blueprint
          </span>
          <Link href="/plans/" className="text-primary-text flex items-center gap-1 text-xs font-semibold hover:underline">
            Choose Plan <ChevronRight className="size-3" />
          </Link>
        </div>
        <div>
          <h3 className="text-base font-bold text-foreground">No Active Program Selected</h3>
          <p className="text-muted-foreground text-xs mt-0.5">
            Select a multi-week program or have AI design a tailored hypertrophy plan to automatically map progressive overload targets here.
          </p>
        </div>
        <Link
          href="/plans/?build=1"
          className="bg-secondary/70 hover:bg-secondary flex items-center justify-between rounded-xl p-3 text-xs font-semibold transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sparkles className="text-primary size-4" />
            Build new hypertrophy plan
          </span>
          <ArrowUpRight className="size-4 text-muted-foreground" />
        </Link>
      </Card>
    );
  }

  // Active program: determine targeted muscles from routine exercises
  const targetedMuscles = new Set<string>();
  for (const t of targets) {
    const ex = exercises.get(t.exercise_id);
    if (ex?.primary_muscle) targetedMuscles.add(ex.primary_muscle);
  }

  // Compute readiness for targeted muscles
  const targetedMuscleRecoveries = recovery.filter((m) => targetedMuscles.has(m.muscle));
  const avgReadiness = targetedMuscleRecoveries.length
    ? Math.round(targetedMuscleRecoveries.reduce((acc, m) => acc + m.recovery, 0) / targetedMuscleRecoveries.length)
    : 100;

  const nextTitle = workoutTitle(program.next_routine_name ?? "Next Session");

  return (
    <Card className="border-border/70 p-4 transition-all" data-testid="next-session-card">
      <div className="flex items-center justify-between gap-2">
        <span className="bg-primary/10 text-primary-text inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide uppercase">
          <Zap className="size-3" /> Next Session Blueprint
        </span>
        <span className="text-muted-foreground text-xs font-medium">
          Week {program.next_week} · Day {program.next_day}
        </span>
      </div>

      <div className="mt-2 min-w-0">
        <h3 className="truncate text-lg font-bold tracking-tight text-foreground">{nextTitle}</h3>
        <p className="text-muted-foreground text-xs">
          {program.program_name} · <span className="font-semibold text-foreground">{program.done} of {program.total} done</span>
        </p>
      </div>

      {/* Target Muscle Readiness Bar */}
      <div className="bg-secondary/60 mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
          <Activity className="size-3.5 text-primary" /> Target Muscle Readiness
        </span>
        <span className="flex items-center gap-1.5 font-bold">
          <span className={`inline-block size-2 rounded-full ${avgReadiness >= 90 ? "bg-success" : avgReadiness >= 60 ? "bg-chart-1" : "bg-destructive"}`} />
          <span className="num">{avgReadiness}% recovered</span>
        </span>
      </div>

      {/* Progressive Overload Exercise Targets */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider">
            Target Exercises ({targets.length})
          </span>
          {settings.autoApplyPeriodization ? (
            <span className="text-primary-text font-bold text-[10px] bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5">
              {getPhaseForWeek(program.next_week ?? settings.currentMesocycleWeek, settings.totalMesocycleWeeks).label} Phase
            </span>
          ) : (
            <span className="text-muted-foreground text-[10px]">Aim for progressive overload</span>
          )}
        </div>

        <div className="flex flex-col divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50 bg-secondary/30">
          {targets.slice(0, 4).map((t, idx) => {
            const ex = exercises.get(t.exercise_id);
            const activeWeek = program.next_week ?? settings.currentMesocycleWeek;
            const pTarget = settings.autoApplyPeriodization && ex
              ? calculatePeriodizedTarget(
                  {
                    exerciseId: t.exercise_id,
                    exerciseName: ex.name,
                    primary_muscle: ex.primary_muscle,
                    target_sets: t.target_sets,
                    target_reps: t.target_reps,
                    target_reps_max: t.target_reps_max,
                    target_weight_kg: t.target_weight_kg,
                  },
                  activeWeek,
                  settings.totalMesocycleWeeks,
                  unit,
                )
              : null;

            const displaySets = pTarget ? pTarget.periodizedSets : t.target_sets;
            const displayMinReps = pTarget ? pTarget.periodizedReps : t.target_reps;
            const displayMaxReps = pTarget ? pTarget.periodizedRepsMax : t.target_reps_max;
            const repRange = displayMaxReps && displayMaxReps !== displayMinReps
              ? `${displayMinReps}-${displayMaxReps}`
              : `${displayMinReps}`;
            const targetWeightKg = pTarget ? pTarget.periodizedWeightKg : t.target_weight_kg;
            const targetLoad = targetWeightKg ? formatWeight(targetWeightKg, unit) : null;

            return (
              <div key={t.id || idx} className="flex items-center justify-between px-3 py-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground font-mono text-[10px] w-3">{idx + 1}.</span>
                  <span className="truncate font-medium text-foreground">{ex?.name ?? "Exercise"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="num font-semibold text-muted-foreground">
                    {displaySets} × {repRange} reps
                  </span>
                  {targetLoad && (
                    <span className="num font-bold text-primary-text bg-primary/10 rounded px-1.5 py-0.5 text-[11px]">
                      {targetLoad}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          {targets.length > 4 && (
            <div className="bg-secondary/40 px-3 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
              +{targets.length - 4} more exercises queued
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
