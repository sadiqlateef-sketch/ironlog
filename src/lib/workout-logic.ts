// Small pure helpers for the workout logger. No React, no Supabase, easy to test.

import type { SetType } from "../types/database";

export const SET_TYPE_ORDER: SetType[] = ["normal", "warmup", "drop", "failure"];

/** Tapping the set-number badge cycles: normal -> warm-up -> drop -> failure -> normal. */
export function nextSetType(current: SetType): SetType {
  const i = SET_TYPE_ORDER.indexOf(current);
  return SET_TYPE_ORDER[(i + 1) % SET_TYPE_ORDER.length];
}

/** Short label shown in the set column. Normal sets show their working-set number. */
export function setLabel(type: SetType, workingIndex: number): string {
  switch (type) {
    case "warmup":
      return "W";
    case "drop":
      return "D";
    case "failure":
      return "F";
    default:
      return String(workingIndex);
  }
}

/** For each set, its number counting only normal sets (W, D and F don't count). */
export function workingSetNumbers(types: SetType[]): number[] {
  let n = 0;
  return types.map((t) => (t === "normal" ? ++n : n));
}

/** Parse a user-typed number. Empty or invalid -> null. Accepts "," as decimal. */
export function parseNumber(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Round to the nearest 0.5 for display (kg or lb). */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

/**
 * Should finishing this set start the rest timer? In a superset you rest only
 * after the LAST exercise of the group, so you can go straight from A to B.
 */
export function shouldStartRest(
  exerciseOrder: number,
  supersetGroup: number | null,
  exercises: { order: number; supersetGroup: number | null }[],
): boolean {
  if (supersetGroup == null) return true;
  const inGroup = exercises.filter((e) => e.supersetGroup === supersetGroup).map((e) => e.order);
  return exerciseOrder === Math.max(...inGroup);
}

/** mm:ss for the rest timer. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}
