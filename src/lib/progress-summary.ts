// Pure numbers behind the three cards at the top of Progress: new records this
// week, the main lifts' estimated 1RM trend, and the one lift that needs attention.
// Weights are whatever unit the sets are in.

import { findPlateaus, liftFor, sessionBests, type Lift, type Plateau } from "./insights.ts";
import { weekStart, type StatSet } from "./stats.ts";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

/** The lifts shown, in order. */
export const MAIN_LIFTS: Lift[] = ["squat", "bench", "deadlift", "press"];

/**
 * Exercises whose best estimated 1RM this week beats everything before it.
 * A lift with no earlier history doesn't count, so a new account isn't told it set a dozen records.
 */
export function newPrsThisWeek(sets: StatSet[], now: number): number {
  const start = weekStart(now);
  let count = 0;
  for (const id of new Set(sets.map((s) => s.exercise_id))) {
    const bests = sessionBests(sets, id);
    const before = bests.filter((b) => b.at < start);
    const during = bests.filter((b) => b.at >= start && b.at <= now);
    if (!before.length || !during.length) continue;
    if (Math.max(...during.map((b) => b.e1rm)) > Math.max(...before.map((b) => b.e1rm)) * 1.005) count++;
  }
  return count;
}

export interface MainLift {
  lift: Lift;
  exerciseId: string;
  /** Best estimated 1RM of each workout, oldest first. */
  points: { at: number; value: number }[];
  current: number;
  /** Last minus first in the window; null with a single workout. */
  change: number | null;
  /** Weeks since the last new best, once it's been 3 or more. */
  flatWeeks: number | null;
}

/** For each main lift you've logged lately: its estimated 1RM trend over the last `weeks` weeks. */
export function mainLifts(sets: StatSet[], slugOf: (exerciseId: string) => string | undefined, now: number, weeks = 12): MainLift[] {
  const since = now - weeks * WEEK;
  const ids = new Set(sets.map((s) => s.exercise_id));
  const out: MainLift[] = [];
  for (const lift of MAIN_LIFTS) {
    let best: { id: string; bests: ReturnType<typeof sessionBests> } | null = null;
    for (const id of ids) {
      const slug = slugOf(id);
      if (!slug || liftFor(slug) !== lift) continue;
      const bests = sessionBests(sets, id).filter((b) => b.at >= since);
      if (bests.length && (!best || bests.length > best.bests.length)) best = { id, bests };
    }
    if (!best) continue;
    const { id, bests } = best;
    let top = bests[0];
    for (const b of bests.slice(1)) if (b.e1rm > top.e1rm * 1.005) top = b;
    const flat = Math.floor((now - top.at) / WEEK);
    out.push({
      lift,
      exerciseId: id,
      points: bests.map((b) => ({ at: b.at, value: b.e1rm })),
      current: bests.at(-1)!.e1rm,
      change: bests.length > 1 ? bests.at(-1)!.e1rm - bests[0].e1rm : null,
      flatWeeks: flat >= 3 && bests.length > 1 ? flat : null,
    });
  }
  return out;
}

/** The worst stalled lift, if any. */
export function needsAttention(sets: StatSet[], unit: string, now: number): Plateau | null {
  return findPlateaus(sets, { unit, now })[0] ?? null;
}
