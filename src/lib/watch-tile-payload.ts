// Wear OS Ambient Live Tile & Complication Payload Engine.
// Formats synchronized workout telemetry for Wear OS Android Watch Faces,
// Complication Providers, and Glanceable Tiles.

export interface WatchComplicationPayload {
  complicationType: "RANGED_VALUE" | "SHORT_TEXT" | "ICON";
  title: string;
  shortText: string;
  progressPercent: number; // 0 - 100
  iconName: "timer" | "dumbbell" | "heart" | "check";
  updatedAtIso: string;
}

export interface WatchTilePayload {
  workoutName: string;
  exerciseName: string;
  exerciseSlug: string;
  setIndexText: string; // e.g. "Set 3 of 4"
  targetWeightText: string; // e.g. "225 lb"
  targetRepsText: string; // e.g. "5 reps"
  isRestActive: boolean;
  restSecondsRemaining: number;
  totalRestSeconds: number;
  restPercent: number; // 0 - 100
  canLogCurrentSet: boolean;
  sessionElapsedMinutes: number;
}

/**
 * Builds standard Wear OS Complication payload for watch faces.
 */
export function buildWatchComplication(
  isRestActive: boolean,
  restRemainingSeconds: number,
  restTotalSeconds: number,
  currentExercise = "IronLog",
): WatchComplicationPayload {
  const now = new Date().toISOString();

  if (isRestActive && restTotalSeconds > 0) {
    const elapsed = Math.max(0, restTotalSeconds - restRemainingSeconds);
    const progress = Math.min(100, Math.round((elapsed / restTotalSeconds) * 100));
    return {
      complicationType: "RANGED_VALUE",
      title: "REST",
      shortText: `${restRemainingSeconds}s`,
      progressPercent: progress,
      iconName: "timer",
      updatedAtIso: now,
    };
  }

  return {
    complicationType: "SHORT_TEXT",
    title: "LIFT",
    shortText: currentExercise.slice(0, 5).toUpperCase(),
    progressPercent: 100,
    iconName: "dumbbell",
    updatedAtIso: now,
  };
}

/**
 * Builds high-density Wear OS Live Tile payload for glanceable wrist interactions.
 */
export function buildWatchTile(params: {
  workoutName?: string;
  exerciseName: string;
  exerciseSlug: string;
  currentSetIndex: number;
  totalSets: number;
  targetWeight: number | string;
  targetReps: number | string;
  unit?: "lb" | "kg";
  isRestActive?: boolean;
  restRemaining?: number;
  totalRest?: number;
  startedAt?: string;
}): WatchTilePayload {
  const {
    workoutName = "Active Workout",
    exerciseName,
    exerciseSlug,
    currentSetIndex,
    totalSets,
    targetWeight,
    targetReps,
    unit = "lb",
    isRestActive = false,
    restRemaining = 0,
    totalRest = 120,
    startedAt,
  } = params;

  let sessionElapsedMinutes = 0;
  if (startedAt) {
    const diffMs = Date.now() - new Date(startedAt).getTime();
    sessionElapsedMinutes = Math.max(0, Math.floor(diffMs / 60000));
  }

  const restPercent =
    isRestActive && totalRest > 0
      ? Math.min(100, Math.round(((totalRest - restRemaining) / totalRest) * 100))
      : 0;

  return {
    workoutName,
    exerciseName,
    exerciseSlug,
    setIndexText: `Set ${currentSetIndex} of ${totalSets}`,
    targetWeightText: `${targetWeight} ${unit}`,
    targetRepsText: `${targetReps} reps`,
    isRestActive,
    restSecondsRemaining: Math.max(0, restRemaining),
    totalRestSeconds: totalRest,
    restPercent,
    canLogCurrentSet: !isRestActive,
    sessionElapsedMinutes,
  };
}
