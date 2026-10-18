// "Use What You Got": a short nightly workout built only from your home kit.
// The same workout all evening (seeded by the date), a fresh one every night.
// No app imports, so it can be unit tested.

import { dumbbellWeights, kitAllows, type Kit, type KitExercise } from "./kit.ts";

export const HOME_MINUTES = [15, 20, 25] as const;

/** Movement patterns, each with the home-friendly moves that fill it (best first). */
const POOL = {
  squat: ["goblet-squat", "bulgarian-split-squat", "front-squat", "dumbbell-squat", "plie-dumbbell-squat", "bodyweight-squat", "freehand-jump-squat"],
  lunge: ["dumbbell-rear-lunge", "dumbbell-lunges", "dumbbell-step-ups", "bulgarian-split-squat", "step-up-with-knee-raise"],
  hinge: ["romanian-deadlift", "conventional-deadlift", "stiff-legged-dumbbell-deadlift", "kettlebell-one-legged-deadlift", "one-arm-kettlebell-swings", "barbell-glute-bridge", "single-leg-glute-bridge", "butt-lift-bridge"],
  push: ["pushups", "floor-press", "dumbbell-floor-press", "one-arm-kettlebell-floor-press", "push-ups-with-feet-elevated", "push-up-wide", "one-arm-dumbbell-bench-press", "dumbbell-bench-press"],
  press: ["overhead-press", "dumbbell-one-arm-shoulder-press", "standing-palm-in-one-arm-dumbbell-press", "push-press", "dumbbell-shoulder-press", "one-arm-side-laterals"],
  pull: ["dumbbell-row", "barbell-row", "one-arm-kettlebell-row", "pendlay-row", "pull-up", "chin-up", "upright-barbell-row"],
  biceps: ["barbell-curl", "concentration-curls", "standing-concentration-curl", "cross-body-hammer-curl", "reverse-barbell-curl", "hammer-curls"],
  triceps: ["standing-dumbbell-triceps-extension", "seated-triceps-press", "tricep-dumbbell-kickback", "push-ups-close-triceps-position", "dumbbell-one-arm-triceps-extension"],
  core: ["plank", "dead-bug", "russian-twist", "reverse-crunch", "dumbbell-side-bend", "side-bridge", "flutter-kicks", "crunches"],
  calves: ["standing-dumbbell-calf-raise", "calf-raise-on-a-dumbbell", "standing-barbell-calf-raise"],
} as const;
type Pattern = keyof typeof POOL;

export const HOME_FOCUS = {
  full: { label: "Full Body", slots: ["squat", "push", "hinge", "pull", "press", "core", "lunge", "biceps", "triceps"] },
  upper: { label: "Upper Body", slots: ["push", "pull", "press", "biceps", "triceps", "pull", "core"] },
  lower: { label: "Legs", slots: ["squat", "hinge", "lunge", "calves", "core", "hinge"] },
  push: { label: "Push", slots: ["push", "press", "triceps", "push", "core", "press"] },
  pull: { label: "Pull", slots: ["pull", "hinge", "biceps", "pull", "core", "biceps"] },
} as const satisfies Record<string, { label: string; slots: Pattern[] }>;
export type HomeFocus = keyof typeof HOME_FOCUS;

/** Patterns where you grab your heaviest dumbbell. */
const HEAVY: Pattern[] = ["squat", "lunge", "hinge", "pull", "calves"];

export interface HomeItem<T extends KitExercise = KitExercise> {
  exercise: T;
  sets: number;
  repMin: number;
  repMax: number;
  rest: number;
  /** Supersets share a number: do one set of each, then rest. */
  group: number | null;
  /** The dumbbell to grab, in kg (null = barbell or bodyweight). */
  dumbbell_kg: number | null;
  /** "One arm at a time" and the like. */
  cue: string | null;
}

export interface HomeWorkout<T extends KitExercise = KitExercise> {
  title: string;
  minutes: number;
  focus: HomeFocus;
  items: HomeItem<T>[];
}

/** Small seeded random number generator (same seed, same workout). */
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

/** A number for tonight: "2026-10-18" plus how many times you've tapped shuffle. */
export function nightSeed(dateKey: string, shuffles = 0): number {
  let h = 2166136261;
  for (const c of `${dateKey}#${shuffles}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** "Surprise me": a length and focus picked from the seed. */
export function surprise(seed: number): { minutes: number; focus: HomeFocus } {
  const r = rng(seed ^ 0x5eed);
  const foci = Object.keys(HOME_FOCUS) as HomeFocus[];
  return { minutes: HOME_MINUTES[Math.floor(r() * HOME_MINUTES.length)], focus: foci[Math.floor(r() * foci.length)] };
}

/** Minutes for one block: a superset pair or a single exercise. ~40 s a set, a minute to set up each move. */
export function blockMinutes(items: { sets: number; rest: number }[]): number {
  const sets = items[0].sets;
  return (60 * items.length + sets * 40 * items.length + (sets - 1) * items[0].rest) / 60;
}

const isUnilateral = (slug: string) => /one-arm|one-leg|single|concentration|split-squat|lunge|step-up|kickback|cross-body/.test(slug);

/**
 * Build tonight's workout from your kit. Moves are paired into supersets to
 * fit more into a short session; a core move can close it out on its own.
 */
export function buildHomeWorkout<T extends KitExercise>(
  library: T[],
  kit: Kit,
  opts: { minutes: number; focus: HomeFocus },
  seed = 1,
): HomeWorkout<T> {
  const random = rng(seed);
  const bySlug = new Map(library.filter((e) => !e.created_by).map((e) => [e.slug, e]));
  const dbs = dumbbellWeights(kit);
  const used = new Set<string>();

  const choose = (pattern: Pattern): T | null => {
    const options = POOL[pattern]
      .map((s) => bySlug.get(s))
      .filter((e): e is T => !!e && !used.has(e.slug) && kitAllows(e, kit));
    if (!options.length) return null;
    // Mostly the best few, sometimes something different.
    const top = options.slice(0, Math.min(options.length, 3));
    return top[Math.floor(random() * top.length)];
  };

  const make = (e: T, pattern: Pattern, group: number | null): HomeItem<T> => {
    const isDb = e.equipment === "dumbbell" || e.equipment === "kettlebell";
    const heavy = HEAVY.includes(pattern);
    const dumbbell_kg = isDb ? (dbs ? (heavy ? dbs[dbs.length - 1] : dbs[0]) : null) : null;
    const timed = e.slug === "plank" || e.slug === "side-bridge";
    const bodyweight = e.equipment === "bodyweight";
    const [repMin, repMax] = timed ? [30, 45] : pattern === "core" ? [12, 20] : bodyweight ? [10, 20] : heavy ? [8, 12] : [10, 15];
    return {
      exercise: e,
      sets: 3,
      repMin,
      repMax,
      rest: 60,
      group,
      dumbbell_kg,
      cue: isUnilateral(e.slug) ? "Each side" : null,
    };
  };

  const slots = HOME_FOCUS[opts.focus].slots as readonly Pattern[];
  const items: HomeItem<T>[] = [];
  let minutes = 0;
  let group = 1;
  let i = 0;
  // Pairs first; stop once the next block would run past the time you picked.
  while (i < slots.length) {
    const a = slots[i];
    const b = slots[i + 1];
    const ea = choose(a);
    if (!ea) {
      i++;
      continue;
    }
    used.add(ea.slug);
    const eb = b ? choose(b) : null;
    const block = eb ? [make(ea, a, group), make(eb, b!, group)] : [make(ea, a, null)];
    const m = blockMinutes(block);
    if (items.length && minutes + m > opts.minutes + 1) {
      // The pair doesn't fit; one more exercise on its own might.
      const single = [{ ...block[0], group: null }];
      if (block.length === 2 && minutes + blockMinutes(single) <= opts.minutes + 1) {
        items.push(...single);
        minutes += blockMinutes(single);
        i++;
        continue;
      }
      break;
    }
    if (eb) used.add(eb.slug);
    items.push(...block);
    minutes += m;
    if (eb) group++;
    i += eb ? 2 : 1;
  }

  return {
    title: `${opts.minutes} min ${HOME_FOCUS[opts.focus].label} · Use What You Got`,
    minutes: Math.round(minutes),
    focus: opts.focus,
    items,
  };
}

/** Next exercise for one spot: the next home-friendly move for the same muscles that fits your kit. */
export function swapHomeItem<T extends KitExercise & { primary_muscle: string }>(
  item: HomeItem<T>,
  library: T[],
  kit: Kit,
  taken: Set<string>,
): HomeItem<T> | null {
  const pattern = (Object.keys(POOL) as Pattern[]).find((p) => (POOL[p] as readonly string[]).includes(item.exercise.slug));
  const bySlug = new Map(library.filter((e) => !e.created_by).map((e) => [e.slug, e]));
  const candidates = [
    ...(pattern ? POOL[pattern].map((s) => bySlug.get(s)).filter((e): e is T => !!e) : []),
    ...library.filter((e) => !e.created_by && e.primary_muscle === item.exercise.primary_muscle),
  ].filter((e) => e.slug !== item.exercise.slug && !taken.has(e.slug) && kitAllows(e, kit));
  const next = candidates[0];
  if (!next) return null;
  const dbs = dumbbellWeights(kit);
  const isDb = next.equipment === "dumbbell" || next.equipment === "kettlebell";
  return {
    ...item,
    exercise: next,
    dumbbell_kg: isDb ? (item.dumbbell_kg ?? dbs?.[0] ?? null) : null,
    cue: isUnilateral(next.slug) ? "Each side" : null,
  };
}
