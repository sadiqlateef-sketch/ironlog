// 3D Trophy Case & Achievement Badges System
// Evaluates real lifter performance, milestones, strength plateaus shattered,
// and consistency streaks to award metallic tier achievements.

import type { StatSession, StatSet } from "./stats.ts";
import { topE1rms } from "./stats.ts";
import { liftFor } from "./insights.ts";
import type { Exercise } from "./workout-api.ts";

export type TrophyTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";
export type TrophyCategory = "strength" | "consistency" | "volume" | "milestone";

export interface Trophy {
  id: string;
  title: string;
  subtitle: string;
  category: TrophyCategory;
  tier: TrophyTier;
  unlocked: boolean;
  progressPct: number; // 0 - 100
  currentLabel: string;
  targetLabel: string;
  iconName: "trophy" | "flame" | "dumbbell" | "shield" | "sparkles" | "crown";
  description: string;
}

export function evaluateTrophies(
  sessions: StatSession[],
  sets: StatSet[],
  exercises: Map<string, Exercise>,
  totalWorkouts: number,
  streakWeeks: number,
): Trophy[] {
  const trophies: Trophy[] = [];

  // Calculate Big 3 Totals (Squat + Bench + Deadlift)
  const topLifts = topE1rms(sets, 50);
  let squatMax = 0;
  let benchMax = 0;
  let deadliftMax = 0;

  for (const t of topLifts) {
    const ex = exercises.get(t.exerciseId);
    if (!ex) continue;
    const lift = liftFor(ex.slug);
    if (lift === "squat") squatMax = Math.max(squatMax, t.e1rm);
    else if (lift === "bench") benchMax = Math.max(benchMax, t.e1rm);
    else if (lift === "deadlift") deadliftMax = Math.max(deadliftMax, t.e1rm);
  }

  const big3Total = squatMax + benchMax + deadliftMax;
  const lifetimeVolume = sessions.reduce((acc, s) => acc + s.volume, 0);

  // 1. 1,000 LB Club
  const big3Goal = 1000;
  const big3Progress = Math.min(100, Math.round((big3Total / big3Goal) * 100));
  trophies.push({
    id: "1000lb-club",
    title: "1,000 LB Club",
    subtitle: "Combined S/B/D Total",
    category: "strength",
    tier: big3Total >= 1000 ? "gold" : big3Total >= 750 ? "silver" : "bronze",
    unlocked: big3Total >= 1000,
    progressPct: big3Progress,
    currentLabel: `${Math.round(big3Total)} lb`,
    targetLabel: "1,000 lb",
    iconName: "crown",
    description: "Achieve a combined estimated 1RM of 1,000 lbs across Squat, Bench Press, and Deadlift.",
  });

  // 2. Century Club (100 Finished Workouts)
  const centuryProgress = Math.min(100, Math.round((totalWorkouts / 100) * 100));
  trophies.push({
    id: "century-club",
    title: "Century Club",
    subtitle: "100 Sessions Completed",
    category: "milestone",
    tier: totalWorkouts >= 100 ? "platinum" : totalWorkouts >= 50 ? "gold" : totalWorkouts >= 25 ? "silver" : "bronze",
    unlocked: totalWorkouts >= 100,
    progressPct: centuryProgress,
    currentLabel: `${totalWorkouts} sessions`,
    targetLabel: "100 sessions",
    iconName: "shield",
    description: "Commitment etched in iron: Complete 100 total logged workout sessions.",
  });

  // 3. Iron Streak (12-Week Consistency)
  const streakGoal = 12;
  const streakProgress = Math.min(100, Math.round((streakWeeks / streakGoal) * 100));
  trophies.push({
    id: "iron-streak",
    title: "Iron Discipline",
    subtitle: "12-Week Workout Streak",
    category: "consistency",
    tier: streakWeeks >= 26 ? "diamond" : streakWeeks >= 12 ? "gold" : streakWeeks >= 4 ? "silver" : "bronze",
    unlocked: streakWeeks >= 12,
    progressPct: streakProgress,
    currentLabel: `${streakWeeks} weeks`,
    targetLabel: "12 weeks",
    iconName: "flame",
    description: "Train at least once every week for 12 consecutive weeks without breaking momentum.",
  });

  // 4. Volume Titan (500,000 lbs Lifted)
  const volGoal = 500_000;
  const volProgress = Math.min(100, Math.round((lifetimeVolume / volGoal) * 100));
  trophies.push({
    id: "volume-titan",
    title: "Volume Titan",
    subtitle: "Half-Million Pounds Moved",
    category: "volume",
    tier: lifetimeVolume >= 1_000_000 ? "diamond" : lifetimeVolume >= 500_000 ? "gold" : "silver",
    unlocked: lifetimeVolume >= 500_000,
    progressPct: volProgress,
    currentLabel: `${(lifetimeVolume / 1000).toFixed(0)}k lb`,
    targetLabel: "500k lb",
    iconName: "dumbbell",
    description: "Move a cumulative half-million pounds of iron across all your training sets.",
  });

  // 5. Two-Plate Bench Press (225 lb / 102 kg)
  const benchGoal = 225;
  const benchProgress = Math.min(100, Math.round((benchMax / benchGoal) * 100));
  trophies.push({
    id: "two-plate-bench",
    title: "Two-Plate Press",
    subtitle: "225 lb Bench Press e1RM",
    category: "strength",
    tier: benchMax >= 315 ? "diamond" : benchMax >= 225 ? "gold" : "silver",
    unlocked: benchMax >= 225,
    progressPct: benchProgress,
    currentLabel: `${Math.round(benchMax)} lb`,
    targetLabel: "225 lb",
    iconName: "trophy",
    description: "Hit an estimated or tested 1RM of 225 lbs (two 45 lb plates per side) on the Bench Press.",
  });

  // 6. Movement Virtuoso (15+ Unique Exercises)
  const uniqueExercises = new Set(sets.map((s) => s.exercise_id)).size;
  const exerciseProgress = Math.min(100, Math.round((uniqueExercises / 15) * 100));
  trophies.push({
    id: "movement-virtuoso",
    title: "Movement Virtuoso",
    subtitle: "Exercise Library Mastery",
    category: "milestone",
    tier: uniqueExercises >= 25 ? "platinum" : uniqueExercises >= 15 ? "silver" : "bronze",
    unlocked: uniqueExercises >= 15,
    progressPct: exerciseProgress,
    currentLabel: `${uniqueExercises} exercises`,
    targetLabel: "15 exercises",
    iconName: "sparkles",
    description: "Perform and master at least 15 different exercises in your training log.",
  });

  return trophies;
}
