// Health Connect: what a finished workout looks like when it's sent there,
// and how heart rate and body weight coming back are tidied up. Pure
// functions, so they can be unit tested (the plugin calls are in health.ts).

import { describeTimedSet } from "./cardio.ts";
import { formatWeight, type UnitSystem } from "./units.ts";

/** Exercise types the Android side understands (HealthConnectPlugin.kt). */
export type HealthExerciseType =
  | "strength"
  | "running"
  | "running_treadmill"
  | "walking"
  | "rowing_machine"
  | "biking_stationary"
  | "elliptical"
  | "stair_climbing_machine"
  | "other";

const CARDIO_TYPE: Record<string, HealthExerciseType> = {
  "outdoor-run": "running",
  "treadmill-run": "running_treadmill",
  walk: "walking",
  "rowing-machine": "rowing_machine",
  "stationary-bike": "biking_stationary",
  elliptical: "elliptical",
  "stair-climber": "stair_climbing_machine",
};

export type FinishedSet = {
  set_type: string;
  weight: number;
  reps: number;
  duration_seconds: number | null;
  distance_m: number | null;
  exercise: { name: string; slug: string; tracking: string };
};

export type FinishedWorkout = {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string;
  sets: FinishedSet[];
};

export type HealthWorkout = {
  id: string;
  start: string;
  end: string;
  type: HealthExerciseType;
  title: string;
  notes: string;
  distanceM: number;
};

/**
 * Any lifting makes it strength training. A cardio-only workout takes the type
 * of the machine or run when there's just one kind, otherwise "other".
 */
export function workoutType(sets: FinishedSet[]): HealthExerciseType {
  if (sets.some((s) => s.exercise.tracking === "weight_reps")) return "strength";
  const kinds = new Set(sets.map((s) => CARDIO_TYPE[s.exercise.slug] ?? "other"));
  if (kinds.size === 1) return [...kinds][0];
  return kinds.size ? "other" : "strength";
}

/** One line per exercise, e.g. "Bench Press: 3 sets, top 225 lb x 5". */
export function workoutNotes(sets: FinishedSet[], unit: UnitSystem): string {
  const byExercise = new Map<string, FinishedSet[]>();
  for (const s of sets) {
    const list = byExercise.get(s.exercise.name) ?? [];
    list.push(s);
    byExercise.set(s.exercise.name, list);
  }
  const lines: string[] = [];
  for (const [name, list] of byExercise) {
    const work = list.filter((s) => s.set_type !== "warmup");
    const shown = work.length ? work : list;
    const count = `${shown.length} ${shown.length === 1 ? "set" : "sets"}`;
    const timed = shown.map((s) => describeTimedSet(s, unit, (kg) => formatWeight(kg, unit))).filter((t): t is string => t != null);
    if (timed.length) {
      lines.push(`${name}: ${timed.join(", ")}`);
      continue;
    }
    const top = shown.reduce((best, s) => (s.weight > best.weight || (s.weight === best.weight && s.reps > best.reps) ? s : best));
    lines.push(top.weight > 0 ? `${name}: ${count}, top ${formatWeight(top.weight, unit)} x ${top.reps}` : `${name}: ${count}, best ${top.reps} reps`);
  }
  return lines.join("\n");
}

/** What gets sent for one workout, or null when it has nothing logged. */
export function toHealthWorkout(w: FinishedWorkout, unit: UnitSystem): HealthWorkout | null {
  if (!w.sets.length) return null;
  if (Date.parse(w.end_time) <= Date.parse(w.start_time)) return null;
  const distanceM = w.sets.reduce((sum, s) => sum + (s.distance_m ?? 0), 0);
  return {
    id: w.id,
    start: new Date(w.start_time).toISOString(),
    end: new Date(w.end_time).toISOString(),
    type: workoutType(w.sets),
    title: w.name?.trim() || "Ironlog workout",
    notes: workoutNotes(w.sets, unit),
    distanceM: Math.round(distanceM * 100) / 100,
  };
}

/** Short stable fingerprint, so a workout is only sent again after it changes. */
export function fingerprint(w: HealthWorkout): string {
  const text = JSON.stringify(w);
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Heart-rate readings for one workout, at most one every `everySeconds`, in
 * the range the database accepts.
 */
export function thinHeartRate(samples: { time: string; bpm: number }[], everySeconds = 5): { recorded_at: string; bpm: number }[] {
  const out: { recorded_at: string; bpm: number }[] = [];
  let last = -Infinity;
  const sorted = [...samples].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  for (const s of sorted) {
    const t = Date.parse(s.time);
    const bpm = Math.round(s.bpm);
    if (!Number.isFinite(t) || bpm < 20 || bpm > 250) continue;
    if (t - last < everySeconds * 1000) continue;
    last = t;
    out.push({ recorded_at: new Date(t).toISOString(), bpm });
  }
  return out;
}

/**
 * Weigh-ins grouped by the local day they happened on, keeping the last one
 * of each day, for days that don't already have a weight in Ironlog.
 */
export function weightsToImport(
  records: { time: string; kg: number }[],
  daysWithWeight: Set<string>,
  dayOf: (d: Date) => string,
): { day: string; kg: number }[] {
  const latest = new Map<string, { t: number; kg: number }>();
  for (const r of records) {
    const t = Date.parse(r.time);
    if (!Number.isFinite(t) || !(r.kg > 20 && r.kg < 400)) continue;
    const day = dayOf(new Date(t));
    if (daysWithWeight.has(day)) continue;
    const seen = latest.get(day);
    if (!seen || t > seen.t) latest.set(day, { t, kg: r.kg });
  }
  return [...latest]
    .map(([day, v]) => ({ day, kg: Math.round(v.kg * 10) / 10 }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
