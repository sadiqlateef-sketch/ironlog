// Pure helpers for the watch: no React Native imports, so they run in Node tests.

export type UnitSystem = "metric" | "imperial";
export type SetType = "warmup" | "normal" | "drop" | "failure";

export const LB_PER_KG = 2.2046226218;

export interface WatchSet {
  id: string;
  exercise_id: string;
  exercise_order: number;
  set_number: number;
  set_type: SetType;
  weight: number; // kg
  reps: number;
  is_completed: boolean;
  client_id: string | null;
  superset_group: number | null;
}

export interface ExerciseInfo {
  name: string;
  mechanic: "compound" | "isolation" | null;
}

export interface ExerciseGroup {
  order: number;
  exerciseId: string;
  name: string;
  mechanic: "compound" | "isolation" | null;
  supersetGroup: number | null;
  sets: WatchSet[];
}

/** One tap on the + / - weight buttons: 5 lb or 2.5 kg. */
export function weightStepKg(unit: UnitSystem): number {
  return unit === "imperial" ? 5 / LB_PER_KG : 2.5;
}

/** Show a kg value in the lifter's unit, rounded to what plates allow. */
export function displayWeight(kg: number, unit: UnitSystem): string {
  if (unit === "imperial") return `${Math.round(kg * LB_PER_KG * 2) / 2}`;
  return `${Math.round(kg * 4) / 4}`;
}

/** Snap a kg value to the nearest loadable step in the lifter's unit. */
export function snapKg(kg: number, unit: UnitSystem): number {
  const step = weightStepKg(unit);
  return Math.max(0, Math.round(kg / step) * step);
}

export function groupSets(sets: WatchSet[], info: Record<string, ExerciseInfo>): ExerciseGroup[] {
  const byOrder = new Map<number, ExerciseGroup>();
  for (const s of [...sets].sort((a, b) => a.exercise_order - b.exercise_order || a.set_number - b.set_number)) {
    const g = byOrder.get(s.exercise_order) ?? {
      order: s.exercise_order,
      exerciseId: s.exercise_id,
      name: info[s.exercise_id]?.name ?? "Exercise",
      mechanic: info[s.exercise_id]?.mechanic ?? null,
      supersetGroup: s.superset_group,
      sets: [],
    };
    g.sets.push(s);
    byOrder.set(s.exercise_order, g);
  }
  return [...byOrder.values()];
}

/** Where the lifter is up to: the first unfinished set, in workout order. */
export function currentPosition(groups: ExerciseGroup[]): { group: number; set: number } | null {
  for (let g = 0; g < groups.length; g++) {
    const i = groups[g].sets.findIndex((s) => !s.is_completed);
    if (i >= 0) return { group: g, set: i };
  }
  return null;
}

/**
 * Numbers to pre-fill for a set. Weight follows what you actually lifted on
 * the previous set (so a change you made carries forward), falling back to
 * the plan's target. Reps use the set's own target first.
 */
export function prefill(group: ExerciseGroup, setIndex: number): { weight: number; reps: number } {
  const s = group.sets[setIndex];
  const earlier = group.sets.slice(0, setIndex).reverse();
  const prev = earlier.find((p) => p.is_completed && p.set_type === s.set_type);
  return {
    weight: prev?.weight ?? (s.weight > 0 ? s.weight : 0),
    reps: s.reps > 0 ? s.reps : prev?.reps ?? 0,
  };
}

/**
 * Rest after a set, same rules as the phone app: the routine's rest if it has
 * one, else your default for compound lifts (120 s) or 90 s for isolation.
 * Warm-ups cap at 60 s. In a superset you only rest after its last exercise.
 */
export function restSeconds(o: {
  type: SetType;
  mechanic: "compound" | "isolation" | null;
  routineRest: number | null;
  profileDefault: number | null;
  supersetGroup: number | null;
  order: number;
  groups: { order: number; supersetGroup: number | null }[];
}): number {
  const base = o.routineRest ?? (o.mechanic === "compound" ? (o.profileDefault ?? 120) : 90);
  if (o.type === "warmup") return Math.min(60, base);
  if (o.supersetGroup != null) {
    const last = Math.max(...o.groups.filter((g) => g.supersetGroup === o.supersetGroup).map((g) => g.order));
    if (o.order !== last) return 0;
  }
  return base;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Heart-rate zone as a share of an age-based max (220 - age), for the color of the HR readout. */
export function hrZone(bpm: number, age: number | null): 1 | 2 | 3 | 4 | 5 {
  const max = 220 - (age ?? 30);
  const pct = bpm / max;
  if (pct < 0.6) return 1;
  if (pct < 0.7) return 2;
  if (pct < 0.8) return 3;
  if (pct < 0.9) return 4;
  return 5;
}

/**
 * Turn raw sensor readings into rows for heart_rate_samples: one per second at
 * most (the table is unique on session + time), plausible values only.
 */
export function toHrRows(sessionId: string, readings: { at: number; bpm: number }[]) {
  const seen = new Set<number>();
  const rows: { session_id: string; recorded_at: string; bpm: number }[] = [];
  for (const r of readings) {
    const sec = Math.floor(r.at / 1000);
    const bpm = Math.round(r.bpm);
    if (seen.has(sec) || bpm < 20 || bpm > 250) continue;
    seen.add(sec);
    rows.push({ session_id: sessionId, recorded_at: new Date(sec * 1000).toISOString(), bpm });
  }
  return rows;
}
