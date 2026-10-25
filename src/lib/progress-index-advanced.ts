// Advanced Progress Index, Movement Pattern Analytics & Volume Tracker
// Faithfully matches the user's reference specification:
// 1. 6-Week Progress Index Overview & Target Band
// 2. Strength 1RM Change by Movement Pattern (V.Push, V.Pull, H.Push, H.Pull, Squat, Hinge)
// 3. Stimulus Volume (Weekly Effective Sets vs Target & Muscle Group Landmarks)
// 4. Movement Balance (Agonist:Antagonist Ratios & Hexagonal Radar Chart)
// 5. RP Hypertrophy Volume Landmarks (MV, MEV, MAV, MRV)

import { bestE1rm } from "./workout-logic.ts";
import { MUSCLE_LABELS } from "./labels.ts";
import type { StatSet, StatSession } from "./stats.ts";
import type { MuscleGroup } from "@/types/database.ts";

export type MovementPattern = "V.Push" | "V.Pull" | "H.Push" | "H.Pull" | "Squat" | "Hinge";

export const MOVEMENT_PATTERNS: { id: MovementPattern; label: string; fullLabel: string }[] = [
  { id: "V.Push", label: "V.Push", fullLabel: "Vertical Push" },
  { id: "V.Pull", label: "V.Pull", fullLabel: "Vertical Pull" },
  { id: "H.Push", label: "H.Push", fullLabel: "Horizontal Push" },
  { id: "H.Pull", label: "H.Pull", fullLabel: "Horizontal Pull" },
  { id: "Squat", label: "Squat", fullLabel: "Squat / Quad Dominant" },
  { id: "Hinge", label: "Hinge", fullLabel: "Hinge / Posterior Chain" },
];

/**
 * Classifies an exercise into one of the 6 fundamental human movement patterns.
 */
export function classifyMovementPattern(ex: {
  name: string;
  slug?: string;
  primary_muscle?: string;
}): MovementPattern | null {
  const name = (ex.name || "").toLowerCase();
  const slug = (ex.slug || "").toLowerCase();
  const muscle = (ex.primary_muscle || "").toLowerCase();

  // Squat Pattern
  if (
    muscle === "quads" ||
    name.includes("squat") ||
    slug.includes("squat") ||
    name.includes("leg press") ||
    name.includes("hack") ||
    name.includes("lunge")
  ) {
    if (!name.includes("overhead squat")) return "Squat";
  }

  // Hinge Pattern
  if (
    muscle === "hamstrings" ||
    muscle === "glutes" ||
    name.includes("deadlift") ||
    slug.includes("deadlift") ||
    name.includes("rdl") ||
    name.includes("good morning") ||
    name.includes("hip thrust")
  ) {
    return "Hinge";
  }

  // Vertical Push
  if (
    muscle === "front_delts" ||
    name.includes("overhead") ||
    name.includes("shoulder press") ||
    name.includes("military") ||
    name.includes("arnold") ||
    name.includes("push press") ||
    name.includes("handstand")
  ) {
    return "V.Push";
  }

  // Vertical Pull
  if (
    name.includes("pull-up") ||
    name.includes("pullup") ||
    name.includes("chin-up") ||
    name.includes("chinup") ||
    name.includes("lat pull") ||
    name.includes("pulldown")
  ) {
    return "V.Pull";
  }

  // Horizontal Push
  if (
    muscle === "chest" ||
    name.includes("bench") ||
    name.includes("push-up") ||
    name.includes("pushup") ||
    name.includes("chest press") ||
    name.includes("dip")
  ) {
    return "H.Push";
  }

  // Horizontal Pull
  if (
    muscle === "upper_back" ||
    muscle === "lats" ||
    muscle === "traps" ||
    name.includes("row") ||
    name.includes("face pull") ||
    name.includes("rear delt")
  ) {
    return "H.Pull";
  }

  return null;
}

export interface PatternStrengthStats {
  pattern: MovementPattern;
  pctChange: number; // e.g. +19% or -5%
  status: "STRONG GAIN" | "MAINTAINING" | "NEEDS ATTENTION";
  topContributor: {
    exerciseName: string;
    baseline1Rm: number;
    current1Rm: number;
  } | null;
}

/**
 * Calculates 1RM strength changes by movement pattern compared to the 28-day baseline.
 */
export function calculatePatternStrength(
  sets: StatSet[],
  exerciseMap: Map<string, { name: string; slug?: string; primary_muscle?: string }>,
  now = Date.now(),
): PatternStrengthStats[] {
  const DAY = 86_400_000;
  const currentWindowStart = now - 7 * DAY;
  const baselineWindowStart = now - 28 * DAY;

  // Group by pattern -> exercise -> { baselineBest, currentBest }
  const patternData = new Map<
    MovementPattern,
    Map<string, { name: string; baseline: number; current: number }>
  >();

  for (const p of MOVEMENT_PATTERNS) {
    patternData.set(p.id, new Map());
  }

  for (const s of sets) {
    if (s.set_type === "warmup" || !s.completed_at) continue;
    const time = Date.parse(s.completed_at);
    if (time < baselineWindowStart) continue;

    const ex = exerciseMap.get(s.exercise_id);
    if (!ex) continue;
    const pattern = classifyMovementPattern(ex);
    if (!pattern) continue;

    const e1rm = bestE1rm([s]);
    if (!e1rm) continue;

    const exMap = patternData.get(pattern)!;
    const existing = exMap.get(s.exercise_id) ?? { name: ex.name, baseline: 0, current: 0 };

    if (time >= currentWindowStart) {
      existing.current = Math.max(existing.current, e1rm);
    }
    // All sets in 28d window contribute to baseline
    existing.baseline = Math.max(existing.baseline, e1rm);
    exMap.set(s.exercise_id, existing);
  }

  return MOVEMENT_PATTERNS.map((p) => {
    const exMap = patternData.get(p.id)!;
    let totalBase = 0;
    let totalCur = 0;
    let topContributor: PatternStrengthStats["topContributor"] = null;
    let maxDelta = -Infinity;

    for (const [, data] of exMap.entries()) {
      if (data.baseline > 0 && data.current > 0) {
        totalBase += data.baseline;
        totalCur += data.current;
        const delta = data.current - data.baseline;
        if (delta > maxDelta) {
          maxDelta = delta;
          topContributor = {
            exerciseName: data.name,
            baseline1Rm: Math.round(data.baseline),
            current1Rm: Math.round(data.current),
          };
        }
      } else if (data.baseline > 0 && !topContributor) {
        topContributor = {
          exerciseName: data.name,
          baseline1Rm: Math.round(data.baseline),
          current1Rm: Math.round(data.baseline),
        };
      }
    }

    const pctChange = totalBase > 0 && totalCur > 0
      ? Math.round(((totalCur - totalBase) / totalBase) * 100)
      : 0;

    let status: PatternStrengthStats["status"] = "MAINTAINING";
    if (pctChange >= 5) status = "STRONG GAIN";
    else if (pctChange < -2) status = "NEEDS ATTENTION";

    return {
      pattern: p.id,
      pctChange,
      status,
      topContributor,
    };
  });
}

export interface MovementBalanceStats {
  score: string; // e.g. "5/6 on track"
  statusBadge: "BALANCED" | "CONCENTRATED" | "IMBALANCED";
  ratios: {
    vPushToPull: number;
    hPushToPull: number;
    squatToHinge: number;
  };
  radarPoints: { pattern: MovementPattern; label: string; value: number }[]; // 0 to 1 normalized
}

/**
 * Calculates structural balance agonist:antagonist ratios and hexagonal radar coordinates.
 */
export function calculateMovementBalance(
  sets: StatSet[],
  exerciseMap: Map<string, { name: string; slug?: string; primary_muscle?: string }>,
  now = Date.now(),
): MovementBalanceStats {
  const DAY = 86_400_000;
  const since = now - 28 * DAY;

  const patternSets: Record<MovementPattern, number> = {
    "V.Push": 0,
    "V.Pull": 0,
    "H.Push": 0,
    "H.Pull": 0,
    Squat: 0,
    Hinge: 0,
  };

  for (const s of sets) {
    if (s.set_type === "warmup" || !s.completed_at) continue;
    if (Date.parse(s.completed_at) < since) continue;
    const ex = exerciseMap.get(s.exercise_id);
    if (!ex) continue;
    const pattern = classifyMovementPattern(ex);
    if (pattern) patternSets[pattern]++;
  }

  const vPush = Math.max(1, patternSets["V.Push"]);
  const vPull = Math.max(1, patternSets["V.Pull"]);
  const hPush = Math.max(1, patternSets["H.Push"]);
  const hPull = Math.max(1, patternSets["H.Pull"]);
  const squat = Math.max(1, patternSets["Squat"]);
  const hinge = Math.max(1, patternSets["Hinge"]);

  const rVPushPull = Math.round((vPush / vPull) * 10) / 10;
  const rHPushPull = Math.round((hPush / hPull) * 10) / 10;
  const rSquatHinge = Math.round((squat / hinge) * 10) / 10;

  // Radar points normalized 0.1 to 1.0
  const maxSets = Math.max(1, ...Object.values(patternSets));
  const radarOrder: MovementPattern[] = ["Squat", "V.Push", "H.Push", "Hinge", "H.Pull", "V.Pull"];
  const radarPoints = radarOrder.map((p) => ({
    pattern: p,
    label: p,
    value: Math.max(0.15, Math.min(1.0, patternSets[p] / maxSets)),
  }));

  // Count patterns on track (at least 20% of max sets)
  const onTrackCount = Object.values(patternSets).filter((n) => n >= maxSets * 0.25).length;
  let statusBadge: MovementBalanceStats["statusBadge"] = "BALANCED";
  if (onTrackCount < 4) statusBadge = "IMBALANCED";
  else if (onTrackCount < 6) statusBadge = "CONCENTRATED";

  return {
    score: `${onTrackCount}/6 on track`,
    statusBadge,
    ratios: {
      vPushToPull: rVPushPull,
      hPushToPull: rHPushPull,
      squatToHinge: rSquatHinge,
    },
    radarPoints,
  };
}

export interface StimulusVolumeStats {
  effectiveSets: number;
  targetSets: number;
  statusBadge: "ON TARGET" | "BELOW TARGET" | "OVERREACHING";
  dailyCurve: { day: string; sets: number; cumulative: number }[];
  muscleTargets: {
    muscle: string;
    logged: number;
    target: number;
    onTrack: boolean;
    landmark: "Under MEV" | "Optimal MAV" | "Near MRV";
  }[];
}

/**
 * Tracks weekly effective sets and Renaissance Periodization (RP) volume landmarks per muscle.
 */
export function calculateStimulusVolume(
  sets: StatSet[],
  exerciseMap: Map<string, { name: string; primary_muscle?: string }>,
  now = Date.now(),
): StimulusVolumeStats {
  const DAY = 86_400_000;
  const d = new Date(now);
  const dayOfWeek = d.getDay(); // 0 is Sunday
  const startOfWeek = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOfWeek).getTime();

  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const dailyCounts = [0, 0, 0, 0, 0, 0, 0];
  const muscleCounts: Record<string, number> = {};

  // Standard RP Weekly Set Targets for Hypertrophy (MEV/MAV)
  const TARGET_SETS_BY_MUSCLE: Record<string, { target: number; mev: number; mrv: number }> = {
    Chest: { target: 10, mev: 6, mrv: 16 },
    Back: { target: 12, mev: 8, mrv: 18 },
    Shoulders: { target: 10, mev: 6, mrv: 16 },
    Quads: { target: 10, mev: 6, mrv: 16 },
    Hamstrings: { target: 8, mev: 4, mrv: 14 },
    Glutes: { target: 8, mev: 4, mrv: 12 },
    Biceps: { target: 8, mev: 4, mrv: 14 },
    Triceps: { target: 8, mev: 4, mrv: 14 },
    Abs: { target: 8, mev: 4, mrv: 14 },
    Calves: { target: 8, mev: 4, mrv: 12 },
  };

  let totalEffectiveSets = 0;

  for (const s of sets) {
    if (s.set_type === "warmup" || !s.completed_at) continue;
    const time = Date.parse(s.completed_at);
    if (time < startOfWeek || time > now) continue;

    totalEffectiveSets++;
    const setDay = new Date(time).getDay();
    dailyCounts[setDay]++;

    const ex = exerciseMap.get(s.exercise_id);
    if (ex?.primary_muscle) {
      const muscleKey = MUSCLE_LABELS[ex.primary_muscle as MuscleGroup] || ex.primary_muscle;
      muscleCounts[muscleKey] = (muscleCounts[muscleKey] ?? 0) + 1;
    }
  }

  // Cumulative daily curve
  let running = 0;
  const dailyCurve = days.map((day, i) => {
    running += dailyCounts[i];
    return { day, sets: dailyCounts[i], cumulative: running };
  });

  const targetSets = 60; // Standard weekly total target
  let statusBadge: StimulusVolumeStats["statusBadge"] = "ON TARGET";
  if (totalEffectiveSets < targetSets * 0.7) statusBadge = "BELOW TARGET";
  else if (totalEffectiveSets > targetSets * 1.25) statusBadge = "OVERREACHING";

  const muscleTargets = Object.entries(TARGET_SETS_BY_MUSCLE).map(([muscle, cfg]) => {
    const logged = muscleCounts[muscle] ?? 0;
    const onTrack = logged >= cfg.mev;
    let landmark: "Under MEV" | "Optimal MAV" | "Near MRV" = "Optimal MAV";
    if (logged < cfg.mev) landmark = "Under MEV";
    else if (logged >= cfg.mrv) landmark = "Near MRV";

    return {
      muscle,
      logged,
      target: cfg.target,
      onTrack,
      landmark,
    };
  });

  return {
    effectiveSets: totalEffectiveSets,
    targetSets,
    statusBadge,
    dailyCurve,
    muscleTargets,
  };
}

export interface SixWeekOverview {
  weeks: {
    label: string; // e.g. "10.18-24"
    value: number; // e.g. 104.2
    isCurrent: boolean;
    inBand: boolean;
    /** Any sets logged that week; without them the value is a placeholder, not a score. */
    hasData: boolean;
  }[];
  targetBand: { min: number; max: number };
  currentStatus: string;
  statusMessage: string;
}

/**
 * Generates the 6-week trend overview with target band and status diagnosis.
 */
export function calculateSixWeekOverview(
  sets: StatSet[],
  sessions: StatSession[],
  now = Date.now(),
): SixWeekOverview {
  const DAY = 86_400_000;
  const targetBand = { min: 98, max: 106 };
  const weekList: SixWeekOverview["weeks"] = [];

  // Calculate actual rolling weekly strength index across the 6 weeks
  for (let i = 5; i >= 0; i--) {
    const wEnd = now - i * 7 * DAY;
    const wStart = wEnd - 7 * DAY;
    const dStart = new Date(wStart);
    const dEnd = new Date(wEnd);
    const label = `${dStart.getMonth() + 1}.${dStart.getDate()}-${dEnd.getMonth() + 1}.${dEnd.getDate()}`;

    // Real weekly sets in this 7-day interval
    const weekSets = sets.filter((s) => {
      if (s.set_type === "warmup" || !s.completed_at) return false;
      const t = Date.parse(s.completed_at);
      return t >= wStart && t < wEnd;
    });

    let val = 100;
    if (weekSets.length > 0) {
      // Calculate average e1rm improvement over the baseline (prior 28 days from wStart)
      const baselineSets = sets.filter((s) => {
        if (s.set_type === "warmup" || !s.completed_at) return false;
        const t = Date.parse(s.completed_at);
        return t >= wStart - 28 * DAY && t < wStart;
      });

      const baseMaxMap = new Map<string, number>();
      for (const bs of baselineSets) {
        const e = bestE1rm([bs]);
        if (e) baseMaxMap.set(bs.exercise_id, Math.max(baseMaxMap.get(bs.exercise_id) ?? 0, e));
      }

      let ratioSum = 0;
      let ratioCount = 0;
      for (const ws of weekSets) {
        const base = baseMaxMap.get(ws.exercise_id);
        const cur = bestE1rm([ws]);
        if (base && cur && base > 0) {
          ratioSum += cur / base;
          ratioCount++;
        }
      }

      if (ratioCount > 0) {
        val = (ratioSum / ratioCount) * 100;
      } else {
        // Active sets done without prior baseline: healthy starting value
        val = 100 + Math.min(6, weekSets.length * 0.4);
      }
    } else {
      // Empty week - falls below target band indicating inactivity
      val = 94.0;
    }

    weekList.push({
      label,
      value: Math.round(val * 10) / 10,
      isCurrent: i === 0,
      hasData: weekSets.length > 0,
      inBand: val >= targetBand.min && val <= targetBand.max,
    });
  }

  const recentSessions = sessions.filter((s) => Date.parse(s.start_time) >= now - 7 * DAY);
  let currentStatus = "On Target 🎯";
  let statusMessage = "Your training load and progressive overload are progressing right inside the target band.";

  if (recentSessions.length === 0) {
    currentStatus = "No workouts yet this week";
    statusMessage = "Log a workout and your score shows up here. Even 2 compound sessions this week starts building toward the target band.";
  } else if (weekList[5].value > targetBand.max) {
    currentStatus = "Strong Gains 🔥";
    statusMessage = "You're surpassing target benchmarks across key lifts. Maintain recovery to avoid overreaching.";
  }

  return {
    weeks: weekList,
    targetBand,
    currentStatus,
    statusMessage,
  };
}
