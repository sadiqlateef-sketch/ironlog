// A week of food at a glance: days logged, average energy and protein (from
// complete days only), goal hits, the day closest to its energy goal, and body
// weight beside the average intake. Numbers only; no advice. Pure, no app imports.

import { addDays } from "../shifts.ts";
import { dayTotals } from "./entry-math.ts";
import type { DiaryEntry } from "./diary-types.ts";
import type { DayGoal } from "./goals.ts";

/**
 * A day "hits" its energy goal within this share of it either way. A display
 * rule for the report (editable), not a health threshold.
 */
export const ENERGY_HIT_PCT = 10;

export interface WeightPoint {
  measured_on: string;
  weight_kg: number | null;
}

export interface WeekReport {
  days: string[];
  daysLogged: number;
  /** Days left out of the averages because some entry has an unknown value. */
  incompleteDays: string[];
  avgEnergy: number | null;
  avgProtein: number | null;
  /** Days with a goal that were logged and complete. */
  goalDays: number;
  energyHits: number;
  proteinHits: number;
  /** Logged complete day closest to its energy goal. */
  bestDay: { day: string; energy: number; goal: number } | null;
  weight: { first: WeightPoint & { weight_kg: number }; last: WeightPoint & { weight_kg: number }; changeKg: number; count: number } | null;
}

/** The 7 food days ending on `end`, oldest first. */
export function weekEnding(end: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function weekReport(input: {
  days: readonly string[];
  entriesByDay: Readonly<Record<string, readonly DiaryEntry[] | undefined>>;
  goalByDay?: Readonly<Record<string, DayGoal | null | undefined>>;
  weights?: readonly WeightPoint[];
}): WeekReport {
  const days = [...input.days];
  let daysLogged = 0;
  const incompleteDays: string[] = [];
  const energies: number[] = [];
  const proteins: number[] = [];
  let goalDays = 0;
  let energyHits = 0;
  let proteinHits = 0;
  let bestDay: WeekReport["bestDay"] = null;

  for (const day of days) {
    const logged = (input.entriesByDay[day] ?? []).filter((e) => e.status !== "planned");
    if (!logged.length) continue;
    daysLogged++;
    const t = dayTotals(logged);
    const energyOk = t.energy.state !== "incomplete";
    const proteinOk = t.protein.state !== "incomplete";
    if (!energyOk || !proteinOk) incompleteDays.push(day);
    if (energyOk) energies.push(t.energy.value);
    if (proteinOk) proteins.push(t.protein.value);
    const goal = input.goalByDay?.[day];
    if (!goal || !energyOk) continue;
    goalDays++;
    if (Math.abs(t.energy.value - goal.energy) <= (goal.energy * ENERGY_HIT_PCT) / 100) energyHits++;
    if (proteinOk && goal.protein > 0 && t.protein.value >= goal.protein) proteinHits++;
    const gap = Math.abs(t.energy.value - goal.energy);
    if (!bestDay || gap < Math.abs(bestDay.energy - bestDay.goal)) bestDay = { day, energy: Math.round(t.energy.value), goal: goal.energy };
  }

  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  const from = days[0];
  const to = days[days.length - 1];
  const points = (input.weights ?? [])
    .filter((w): w is WeightPoint & { weight_kg: number } => typeof w.weight_kg === "number" && w.measured_on >= from && w.measured_on <= to)
    .sort((a, b) => a.measured_on.localeCompare(b.measured_on));
  const weight =
    points.length > 0
      ? { first: points[0], last: points[points.length - 1], changeKg: round1(points[points.length - 1].weight_kg - points[0].weight_kg), count: points.length }
      : null;

  return {
    days,
    daysLogged,
    incompleteDays,
    avgEnergy: avg(energies),
    avgProtein: avg(proteins),
    goalDays,
    energyHits,
    proteinHits,
    bestDay,
    weight,
  };
}
