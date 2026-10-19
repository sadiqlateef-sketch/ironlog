// Smarter set logging: how hard a set was, warm-ups, and what to lift today.
// Pure helpers in the lifter's own unit (lb or kg). No React, no Supabase.

import { calculatePlates } from "./plates.ts";
import type { EffortScale, SetType } from "../types/database";

// ---------- How hard was that set? ----------

export interface EffortChoice {
  label: string;
  /** Stored as RPE (1-10) whichever way it was asked. */
  rpe: number;
  /** Spoken by screen readers. */
  aria: string;
}

/** The quick-tap choices after a set. RIR = reps in reserve ("how many more could you do?"). */
export function effortChoices(scale: EffortScale): EffortChoice[] {
  if (scale === "rpe")
    return [6, 7, 8, 9, 10].map((r) => ({ label: String(r), rpe: r, aria: `RPE ${r}` }));
  return [
    { label: "0", rpe: 10, aria: "No more reps left" },
    { label: "1", rpe: 9, aria: "1 more rep left" },
    { label: "2", rpe: 8, aria: "2 more reps left" },
    { label: "3", rpe: 7, aria: "3 more reps left" },
    { label: "4+", rpe: 6, aria: "4 or more reps left" },
  ];
}

/** Short tag for a logged set: "2 left" or "RPE 8". */
export function effortLabel(rpe: number | null, scale: EffortScale): string | null {
  if (rpe == null) return null;
  if (scale === "rpe") return `RPE ${rpe}`;
  const left = Math.round(10 - rpe);
  return left >= 4 ? "4+ left" : `${left} left`;
}

/** Just the number for the small badge: "2" / "4+" (RIR) or "8" (RPE). */
export function effortBadge(rpe: number | null, scale: EffortScale): string | null {
  if (rpe == null) return null;
  if (scale === "rpe") return String(rpe);
  const left = Math.round(10 - rpe);
  return left >= 4 ? "4+" : String(left);
}

// ---------- Warm-up sets ----------

export interface WarmupSet {
  weight: number;
  reps: number;
  /** Plates for one side of the bar, heaviest first (plate-loaded lifts only). */
  plates: number[] | null;
}

/**
 * A warm-up ramp up to your working weight.
 * Barbell-type lifts: empty bar x 10, then about 40% x 5, 60% x 3, 80% x 2,
 * each rounded down to what your plates can make. Other lifts: 50% x 8, 75% x 3,
 * rounded to the nearest step. Steps that land on the same weight, or not
 * below the working weight, are dropped.
 */
export function warmupRamp(
  working: number,
  o: { plateLoaded: boolean; bar: number; plates: number[]; step: number },
): WarmupSet[] {
  if (!(working > 0)) return [];
  const out: WarmupSet[] = [];
  const push = (weight: number, reps: number, plates: number[] | null) => {
    const prev = out.at(-1);
    if (weight >= working - 1e-6 || weight <= 0) return;
    if (prev && weight <= prev.weight + 1e-6) return;
    out.push({ weight: round(weight), reps, plates });
  };

  if (o.plateLoaded) {
    if (working <= o.bar) return [];
    push(o.bar, 10, []);
    for (const [pct, reps] of [
      [0.4, 5],
      [0.6, 3],
      [0.8, 2],
    ] as const) {
      const r = calculatePlates(working * pct, o.bar, o.plates);
      push(r.achieved, reps, r.perSide);
    }
    return out;
  }

  for (const [pct, reps] of [
    [0.5, 8],
    [0.75, 3],
  ] as const) {
    push(Math.round((working * pct) / o.step) * o.step, reps, null);
  }
  return out;
}

/** "45 + 10" per side, or "Bar" when nothing goes on. */
export function platesText(perSide: number[]): string {
  return perSide.length ? perSide.join(" + ") : "Bar";
}

/**
 * Last time's set for each of today's sets: warm-ups line up with last time's
 * warm-ups and working sets with working sets, so adding warm-ups today
 * doesn't shift "last time" off by a few rows.
 */
export function matchPrevious<P extends { set_type: SetType }>(today: SetType[], previous: P[]): (P | undefined)[] {
  const warm = previous.filter((p) => p.set_type === "warmup");
  const work = previous.filter((p) => p.set_type !== "warmup");
  let w = 0;
  let n = 0;
  return today.map((t) => (t === "warmup" ? warm[w++] : work[n++]));
}

// ---------- What to lift today ----------

export interface PrevSet {
  set_type: SetType;
  /** In the lifter's unit. */
  weight: number;
  reps: number;
  rpe: number | null;
}

export interface Suggestion {
  /** In the lifter's unit. */
  weight: number;
  from: number;
  why: string;
}

/**
 * Should today's working sets go up from last time? Only when last time shows
 * it's time:
 *  - a rep range from the plan, and every working set at the top weight reached
 *    its top (unless the last one was an all-out grind), or
 *  - every working set at the top weight was rated 3+ reps left (RPE 7 or less).
 * Returns null to keep last time's weight.
 */
export function suggestWeight(
  previous: PrevSet[],
  o: { repMax: number | null; step: number },
): Suggestion | null {
  const working = previous.filter((p) => p.set_type !== "warmup" && p.set_type !== "drop" && p.reps > 0 && p.weight > 0);
  if (!working.length) return null;
  const top = Math.max(...working.map((p) => p.weight));
  const atTop = working.filter((p) => Math.abs(p.weight - top) < 1e-6);
  const rated = atTop.every((p) => p.rpe != null);
  const hardest = rated ? Math.max(...atTop.map((p) => p.rpe!)) : null;
  const next = round(top + o.step);

  if (o.repMax != null && atTop.every((p) => p.reps >= o.repMax!)) {
    if (hardest != null && hardest >= 10) return null;
    return { weight: next, from: top, why: `You hit ${o.repMax} reps on every set last time` };
  }
  if (hardest != null && hardest <= 7) {
    return { weight: next, from: top, why: "Last time felt easy (3+ reps left)" };
  }
  return null;
}

/** Weight step for "go up": 10 lb / 5 kg for big lower-body barbell lifts, else 5 lb / 2.5 kg. */
export function weightStep(unit: "metric" | "imperial", bigLower: boolean): number {
  if (unit === "imperial") return bigLower ? 10 : 5;
  return bigLower ? 5 : 2.5;
}

// ---------- One side at a time ----------

/** Reps saved for a one-side set: each side, and the weaker side as the set's reps. */
export function sideReps(left: number | null, right: number | null): { reps_left: number; reps_right: number; reps: number } | null {
  const l = left ?? right;
  const r = right ?? left;
  if (l == null || r == null) return null;
  return { reps_left: l, reps_right: r, reps: Math.min(l, r) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
