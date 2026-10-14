// Pure helpers for the Workout tab: day cards, time estimates and the Instant
// workout builder. No database calls here, so they're easy to test.

import type { EquipmentType, MuscleGroup } from "@/types/database";

// ---------- Day cards ----------

export interface PlannedItem {
  target_sets: number;
  warmup_sets: number;
  rest_seconds: number;
}

/**
 * Rough minutes for a workout: ~45 s per set, the planned rest between working
 * sets, a minute between warm-ups and a minute to set up each exercise.
 */
export function estimateMinutes(items: PlannedItem[]): number {
  const seconds = items.reduce(
    (t, x) => t + 60 + (x.target_sets + x.warmup_sets) * 45 + x.warmup_sets * 60 + Math.max(0, x.target_sets - 1) * x.rest_seconds,
    0,
  );
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

/** The muscles a workout hits most, most-worked first. */
export function topMuscles<M extends string>(muscles: M[], max = 3): M[] {
  const count = new Map<M, number>();
  muscles.forEach((m) => count.set(m, (count.get(m) ?? 0) + 1));
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || muscles.indexOf(a[0]) - muscles.indexOf(b[0]))
    .slice(0, max)
    .map(([m]) => m);
}

/** "Today", "Yesterday", "5d ago", "3w ago", "4mo ago". */
export function agoLabel(iso: string, now = Date.now()): string {
  const day = 86_400_000;
  const start = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const days = Math.round((start(now) - start(Date.parse(iso))) / day);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** "3 × 8–10 reps", with warm-ups called out: "2 warm-up + 3 × 5 reps". */
export function setsLabel(x: { target_sets: number; target_reps: number; target_reps_max: number | null; warmup_sets: number }): string {
  const reps = x.target_reps_max && x.target_reps_max !== x.target_reps ? `${x.target_reps}–${x.target_reps_max}` : `${x.target_reps}`;
  return `${x.warmup_sets ? `${x.warmup_sets} warm-up + ` : ""}${x.target_sets} × ${reps} reps`;
}

/** Move one item to a new index. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

// ---------- Instant workout ----------

export const INSTANT_MINUTES = [20, 30, 45, 60, 75] as const;

export const INSTANT_EQUIPMENT = {
  gym: { label: "Full gym", allowed: null },
  dumbbells: { label: "Dumbbells", allowed: ["dumbbell", "bodyweight"] },
  home: { label: "Home", allowed: ["dumbbell", "kettlebell", "band", "bodyweight"] },
  bodyweight: { label: "No equipment", allowed: ["bodyweight"] },
} as const satisfies Record<string, { label: string; allowed: EquipmentType[] | null }>;
export type InstantEquipment = keyof typeof INSTANT_EQUIPMENT;

/** Each target is a list of muscle slots, filled in order until time runs out. */
export const INSTANT_TARGETS = {
  full: { label: "Full Body", slots: ["quads", "chest", "lats", "hamstrings", "front_delts", "upper_back", "abs", "glutes", "biceps", "triceps"] },
  chest: { label: "Chest", slots: ["chest", "chest", "triceps", "abs", "chest", "triceps", "abs"] },
  back: { label: "Back", slots: ["lats", "upper_back", "lats", "rear_delts", "biceps", "upper_back", "biceps"] },
  shoulders: { label: "Shoulders", slots: ["front_delts", "side_delts", "rear_delts", "abs", "side_delts", "traps", "front_delts"] },
  arms: { label: "Arms", slots: ["biceps", "triceps", "biceps", "triceps", "forearms", "biceps", "triceps"] },
  legs: { label: "Legs", slots: ["quads", "hamstrings", "glutes", "quads", "calves", "hamstrings", "adductors"] },
  core: { label: "Abs", slots: ["abs", "obliques", "abs", "abs", "obliques", "abs"] },
  push: { label: "Push", slots: ["chest", "front_delts", "chest", "side_delts", "triceps", "triceps", "chest"] },
  pull: { label: "Pull", slots: ["lats", "upper_back", "rear_delts", "biceps", "lats", "biceps", "traps"] },
} as const satisfies Record<string, { label: string; slots: MuscleGroup[] }>;
export type InstantTarget = keyof typeof INSTANT_TARGETS;

export interface InstantCandidate {
  id: string;
  name: string;
  primary_muscle: string;
  equipment: string;
  mechanic: string;
  aliases?: string[];
}

export interface InstantItem<T extends InstantCandidate = InstantCandidate> {
  exercise: T;
  sets: number;
  repMin: number;
  repMax: number;
  rest: number;
}

const EVERYDAY = ["barbell", "dumbbell", "machine", "cable", "smith_machine", "bodyweight"];

/** Small seeded random number generator, so "Shuffle" is repeatable in tests. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Minutes one exercise takes in an Instant workout. */
export function itemMinutes(x: { sets: number; rest: number }): number {
  return (60 + x.sets * 40 + (x.sets - 1) * x.rest) / 60;
}

/**
 * Build a one-off workout for right now: fills the target's muscle slots with
 * exercises you can do on the equipment you have until the time is used up.
 * Staples and big compound lifts come first; the seed picks among the best few.
 */
export function buildInstantWorkout<T extends InstantCandidate>(
  library: T[],
  opts: { minutes: number; equipment: InstantEquipment; target: InstantTarget },
  seed = 1,
): { title: string; items: InstantItem<T>[] } {
  const random = rng(seed);
  const allowed: readonly string[] | null = INSTANT_EQUIPMENT[opts.equipment].allowed;
  const pool = library.filter((e) => !allowed || allowed.includes(e.equipment));
  const slots: readonly string[] = INSTANT_TARGETS[opts.target].slots;
  const items: InstantItem<T>[] = [];
  const used = new Set<string>();
  let minutes = 0;

  for (let i = 0; i < slots.length * 2 && items.length < 10; i++) {
    const muscle = slots[i % slots.length];
    const firstForMuscle = !items.some((x) => x.exercise.primary_muscle === muscle);
    const candidates = pool
      .filter((e) => e.primary_muscle === muscle && !used.has(e.id))
      .map((e) => ({
        e,
        score:
          (e.aliases?.length ? 5 : 0) +
          (EVERYDAY.includes(e.equipment) ? 3 : 0) +
          (firstForMuscle === (e.mechanic === "compound") ? 4 : 0) +
          random() * 2,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    if (!candidates.length) continue;
    const e = candidates[Math.floor(random() * candidates.length)].e;
    const compound = e.mechanic === "compound";
    const item: InstantItem<T> = compound
      ? { exercise: e, sets: opts.minutes >= 60 ? 4 : 3, repMin: 6, repMax: 10, rest: 120 }
      : { exercise: e, sets: 3, repMin: 10, repMax: 15, rest: 60 };
    if (e.equipment === "bodyweight" && !compound) Object.assign(item, { repMin: 12, repMax: 20, rest: 45 });
    if (items.length && minutes + itemMinutes(item) > opts.minutes) break;
    items.push(item);
    used.add(e.id);
    minutes += itemMinutes(item);
  }

  const label = INSTANT_TARGETS[opts.target].label;
  const withAbs = !["core", "full"].includes(opts.target) && items.some((x) => x.exercise.primary_muscle === "abs");
  return { title: `${opts.minutes} min ${label}${withAbs ? " & Abs" : ""} Workout`, items };
}
