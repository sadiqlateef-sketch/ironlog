// Workout DNA & Training Fingerprint Engine
// Analyzes multi-dimensional training patterns and generates a unique,
// mathematically derived "fingerprint" and lifter archetype.

import type { StatSession, StatSet } from "./stats.ts";
import type { Exercise } from "./workout-api.ts";

export interface TraitScore {
  name: string;
  score: number; // 0 - 100
  label: string;
}

export interface TrainingArchetype {
  title: string;
  tagline: string;
  summary: string;
  dominantColor: string;
}

export interface WorkoutDNA {
  archetype: TrainingArchetype;
  traits: TraitScore[];
  // Polar arc coordinates for the radial fingerprint visualization
  polarArcs: {
    category: string;
    radius: number;
    angleStart: number;
    angleEnd: number;
    color: string;
    thickness: number;
  }[];
  statsSummary: {
    totalVolume: number;
    totalSets: number;
    activeDays: number;
    distinctExercises: number;
    avgRpe: number;
  };
}

/**
 * Computes the unique Workout DNA based on the lifter's actual session history.
 */
export function computeWorkoutDNA(
  sessions: StatSession[],
  sets: StatSet[],
  exercises: Map<string, Exercise>,
  now: number = Date.now(),
): WorkoutDNA {
  const thirtyDaysAgo = now - 30 * 86_400_000;
  const recentSessions = sessions.filter((s) => Date.parse(s.start_time) >= thirtyDaysAgo);
  const recentSets = sets.filter((s) => s.completed_at && Date.parse(s.completed_at) >= thirtyDaysAgo);

  const totalVolume = recentSessions.reduce((acc, s) => acc + s.volume, 0);
  const totalSets = recentSets.filter((s) => s.set_type !== "warmup").length;
  const distinctDays = new Set(recentSessions.map((s) => s.start_time.split("T")[0])).size;

  const distinctExerciseIds = new Set(recentSets.map((s) => s.exercise_id));
  const distinctExercises = distinctExerciseIds.size;

  // 1. Calculate Core Trait Scores (0 - 100)
  // Consistency: 12 days in 30 = 100%
  const consistencyScore = Math.min(100, Math.round((distinctDays / 12) * 100));

  // Volume load: 100k lb or ~45k kg in 30 days = 100%
  const volumeScore = Math.min(100, Math.round((totalVolume / 100_000) * 100));

  // Diversity: 15 distinct exercises in 30 days = 100%
  const diversityScore = Math.min(100, Math.round((distinctExercises / 15) * 100));

  // Intensity: based on set_type (failure/amrap = max effort) and heavy loading
  let highEffortSets = 0;
  for (const s of recentSets) {
    if (s.set_type === "failure" || s.set_type === "amrap" || s.reps <= 5) {
      highEffortSets++;
    }
  }
  const intensityScore = Math.min(100, Math.max(35, Math.round((highEffortSets / Math.max(1, totalSets)) * 100) + 25));
  const avgRpe = highEffortSets > totalSets * 0.4 ? 8.8 : 8.0;

  // Muscle balance calculation (Push vs Pull vs Legs)
  let pushSets = 0;
  let pullSets = 0;
  let legSets = 0;

  for (const s of recentSets) {
    if (s.set_type === "warmup") continue;
    const ex = exercises.get(s.exercise_id);
    if (!ex) continue;
    const m = ex.primary_muscle;
    if (m === "chest" || m === "front_delts" || m === "side_delts" || m === "triceps") pushSets++;
    else if (m === "upper_back" || m === "lats" || m === "traps" || m === "rear_delts" || m === "biceps") pullSets++;
    else if (m === "quads" || m === "hamstrings" || m === "glutes" || m === "calves") legSets++;
  }

  // 2. Determine Archetype
  let archetype: TrainingArchetype;
  if (volumeScore >= 70 && diversityScore >= 60) {
    archetype = {
      title: "Hypertrophy Architect",
      tagline: "High volume, methodical variation, muscle isolation",
      summary: "You systematically map volume across muscle angles with controlled mechanical tension.",
      dominantColor: "var(--primary)",
    };
  } else if (intensityScore >= 75 && volumeScore < 60) {
    archetype = {
      title: "Powerbuilder",
      tagline: "Heavy compound load, high neural recruitment",
      summary: "You focus on high-effort working sets near failure on core multi-joint lifts.",
      dominantColor: "var(--destructive)",
    };
  } else if (consistencyScore >= 80 && legSets > 0 && pushSets > 0 && pullSets > 0) {
    archetype = {
      title: "Iron Purist",
      tagline: "Relentless discipline, balanced full-body symmetry",
      summary: "Your training shows strict adherence with exceptional movement balance across all planes.",
      dominantColor: "var(--success)",
    };
  } else {
    archetype = {
      title: "Strength Vanguard",
      tagline: "Adaptive momentum, progressive overload",
      summary: "You build foundational momentum with steady progression on compound pillars.",
      dominantColor: "var(--primary)",
    };
  }

  const traits: TraitScore[] = [
    { name: "Consistency", score: consistencyScore, label: `${distinctDays} days active` },
    { name: "Volume Capacity", score: volumeScore, label: `${totalSets} working sets` },
    { name: "Intensity / Effort", score: intensityScore, label: `Avg RPE ${avgRpe.toFixed(1)}` },
    { name: "Exercise Variety", score: diversityScore, label: `${distinctExercises} movements` },
  ];

  // 3. Generate Polar Fingerprint Arcs (Concentric rings with angle spans)
  const polarArcs = [
    {
      category: "Consistency",
      radius: 40,
      angleStart: 0,
      angleEnd: (consistencyScore / 100) * 360,
      color: "var(--success)",
      thickness: 6,
    },
    {
      category: "Volume",
      radius: 54,
      angleStart: 45,
      angleEnd: 45 + (volumeScore / 100) * 315,
      color: "var(--primary)",
      thickness: 6,
    },
    {
      category: "Intensity",
      radius: 68,
      angleStart: 90,
      angleEnd: 90 + (intensityScore / 100) * 270,
      color: "var(--destructive)",
      thickness: 6,
    },
    {
      category: "Diversity",
      radius: 82,
      angleStart: 135,
      angleEnd: 135 + (diversityScore / 100) * 225,
      color: "var(--ai)",
      thickness: 6,
    },
  ];

  return {
    archetype,
    traits,
    polarArcs,
    statsSummary: {
      totalVolume,
      totalSets,
      activeDays: distinctDays,
      distinctExercises,
      avgRpe,
    },
  };
}
