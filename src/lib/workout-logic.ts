// Small pure helpers for the workout logger. No React, no Supabase, easy to test.

import type { SetType } from "../types/database";
import { weightInput, type UnitSystem } from "./units.ts";

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

// ---------- Logger v2: focus mode, swap, progression ----------

/** Progress-bar segment state for one exercise. */
export type SegmentState = "done" | "current" | "todo";

export function segmentStates(blocks: { order: number; sets: { done: boolean }[] }[], focusOrder: number | null): SegmentState[] {
  return blocks.map((b) =>
    b.order === focusOrder ? "current" : b.sets.length > 0 && b.sets.every((s) => s.done) ? "done" : "todo",
  );
}

/**
 * Which exercise to show after logging a set. In a superset you alternate:
 * A -> B -> A ... so the next one in the group (wrapping round) is up, as long
 * as it still has sets left. Otherwise stay put.
 */
export function focusAfterLog(
  order: number,
  blocks: { order: number; supersetGroup: number | null; sets: { done: boolean }[] }[],
): number {
  const block = blocks.find((b) => b.order === order);
  if (!block || block.supersetGroup == null) return order;
  const group = blocks.filter((b) => b.supersetGroup === block.supersetGroup).sort((a, b) => a.order - b.order);
  const i = group.findIndex((b) => b.order === order);
  for (let k = 1; k <= group.length; k++) {
    const next = group[(i + k) % group.length];
    if (next.sets.some((s) => !s.done)) return next.order;
  }
  return order;
}

/** The first exercise (after this one, wrapping) that still has sets to do. */
export function nextUnfinished(order: number, blocks: { order: number; sets: { done: boolean }[] }[]): number | null {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  const i = sorted.findIndex((b) => b.order === order);
  for (let k = 1; k <= sorted.length; k++) {
    const b = sorted[(i + k) % sorted.length];
    if (b.sets.some((s) => !s.done)) return b.order;
  }
  return null;
}

interface SwapCandidate {
  id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  equipment: string;
  mechanic: string;
  /** Curated exercises carry other names; they're the everyday staples. */
  aliases?: string[];
}

const EVERYDAY_EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "smith_machine", "bodyweight"];

/**
 * Exercises you could swap in: same main muscle, best matches first
 * (same movement type, then everyday staples and gym equipment, then most
 * shared helper muscles, then name).
 */
export function similarExercises<T extends SwapCandidate>(current: SwapCandidate, all: T[], limit = 12): T[] {
  const score = (e: T) =>
    (e.mechanic === current.mechanic ? 10 : 0) +
    (e.aliases?.length ? 5 : 0) +
    (EVERYDAY_EQUIPMENT.includes(e.equipment) ? 3 : 0) +
    e.secondary_muscles.filter((m) => current.secondary_muscles.includes(m)).length;
  return all
    .filter((e) => e.id !== current.id && e.primary_muscle === current.primary_muscle)
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/**
 * Smart swap: the best replacements you can actually do here. Same main
 * muscle, ranked by how many helper muscles match (both ways), same movement
 * type, same equipment, then staples. `allowed` filters to your kit and
 * `exclude` skips what's already in the workout.
 */
export function smartSwaps<T extends SwapCandidate>(
  current: SwapCandidate,
  all: T[],
  opts: { allowed?: (e: T) => boolean; exclude?: Set<string>; limit?: number } = {},
): T[] {
  const mine = new Set(current.secondary_muscles);
  const score = (e: T) => {
    const shared = e.secondary_muscles.filter((m) => mine.has(m)).length;
    const extra = e.secondary_muscles.length - shared;
    const missing = mine.size - shared;
    return (
      (e.mechanic === current.mechanic ? 10 : 0) +
      shared * 3 -
      (extra + missing) +
      (e.equipment === current.equipment ? 2 : 0) +
      (e.aliases?.length ? 5 : 0) +
      (EVERYDAY_EQUIPMENT.includes(e.equipment) ? 2 : 0)
    );
  };
  return all
    .filter((e) => e.id !== current.id && e.primary_muscle === current.primary_muscle && !opts.exclude?.has(e.id) && (opts.allowed?.(e) ?? true))
    .map((e) => ({ e, s: score(e) }))
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
    .slice(0, opts.limit ?? 12)
    .map((x) => x.e);
}

/** Best Epley estimate across sets (weights in any one unit). 0 when nothing logged. */
export function bestE1rm(sets: { weight: number; reps: number }[]): number {
  let best = 0;
  for (const s of sets) {
    if (s.weight <= 0 || s.reps <= 0) continue;
    const e = s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30);
    if (e > best) best = e;
  }
  return best;
}

/**
 * Split text so numbers (with their unit or range) can be highlighted:
 * "best set was 140 lb × 5 reps, top of your 6-8 range" ->
 * ["best set was ", "140 lb × 5 reps", ", top of your ", "6-8", " range"]
 * Odd indexes are the highlighted parts.
 */
export function splitNumbers(text: string): string[] {
  const re = /\d+(?:[.,]\d+)?(?:\s?(?:%|kg|lbs?))?(?:\s?[×x]\s?\d+(?:\s?reps?)?)?(?:\s?[-–]\s?\d+(?:\s?reps?)?)?(?:\s?reps?)?/gi;
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    out.push(text.slice(last, m.index), m[0]);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** Rest-time presets offered in the rest timer sheet, in seconds. */
export const REST_PRESETS = [30, 60, 90, 120, 150, 180, 240, 300];

/** Where an interval session is at a given number of seconds since it started. */
export function intervalPhase(elapsed: number, work: number, rest: number, rounds: number) {
  const cycle = work + rest;
  const total = cycle * rounds - rest; // no rest after the last round
  if (elapsed >= total) return { phase: "done" as const, round: rounds, left: 0 };
  const round = Math.floor(elapsed / cycle) + 1;
  const into = elapsed - (round - 1) * cycle;
  return into < work
    ? { phase: "work" as const, round, left: work - into }
    : { phase: "rest" as const, round, left: cycle - into };
}

// ---------- Exercise detail: history, chart, guide ----------

export interface HistorySet {
  session_id: string;
  set_number: number;
  set_type: string;
  weight: number;
  reps: number;
  completed_at: string | null;
  duration_seconds?: number | null;
  distance_m?: number | null;
}

export interface HistoryDay {
  sessionId: string;
  date: string;
  name: string | null;
  sets: HistorySet[];
  /** Index into sets of the best working set (highest Epley estimate), or -1. */
  best: number;
  /** Median seconds between finished sets that day, or null if it can't be told. */
  restSeconds: number | null;
  e1rm: number;
  volume: number;
}

/** Group one exercise's logged sets by workout, newest workout first. */
export function groupHistory(
  sets: HistorySet[],
  sessions: { id: string; start_time: string; name: string | null }[],
): HistoryDay[] {
  const bySession = new Map<string, HistorySet[]>();
  for (const s of sets) bySession.set(s.session_id, [...(bySession.get(s.session_id) ?? []), s]);
  return sessions
    .filter((x) => bySession.has(x.id))
    .map((x) => {
      const day = bySession.get(x.id)!.sort((a, b) => a.set_number - b.set_number);
      let best = -1;
      let e1rm = 0;
      day.forEach((s, i) => {
        if (s.set_type === "warmup") return;
        const e = bestE1rm([s]);
        if (e > e1rm) [e1rm, best] = [e, i];
      });
      const times = day.map((s) => (s.completed_at ? Date.parse(s.completed_at) : NaN)).filter((t) => !isNaN(t)).sort((a, b) => a - b);
      const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000).filter((g) => g > 0 && g < 15 * 60).sort((a, b) => a - b);
      return {
        sessionId: x.id,
        date: x.start_time,
        name: x.name,
        sets: day,
        best,
        restSeconds: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null,
        e1rm,
        volume: day.filter((s) => s.set_type !== "warmup").reduce((v, s) => v + s.weight * s.reps, 0),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

export const CHART_RANGES = [
  { label: "14D", days: 14 },
  { label: "1M", days: 30 },
  { label: "3M", days: 91 },
  { label: "6M", days: 182 },
  { label: "12M", days: 365 },
  { label: "All", days: null },
] as const;

/** Oldest-first points for the chart tab, limited to the last `days` (null = all). */
export function chartPoints(history: HistoryDay[], metric: "e1rm" | "volume", days: number | null, now = Date.now()) {
  const since = days == null ? -Infinity : now - days * 86_400_000;
  const points = history
    .filter((d) => Date.parse(d.date) >= since && (metric === "volume" ? d.volume > 0 : d.e1rm > 0))
    .map((d) => ({ day: d, value: metric === "e1rm" ? d.e1rm : d.volume }))
    .reverse();
  const pick = (better: (a: number, b: number) => boolean) =>
    points.reduce<(typeof points)[number] | null>((m, p) => (!m || better(p.value, m.value) ? p : m), null);
  const lo = pick((a, b) => a < b);
  const hi = pick((a, b) => a > b);
  return {
    points,
    min: lo && { value: lo.value, date: lo.day.date },
    max: hi && { value: hi.value, date: hi.day.date },
  };
}

/**
 * Rough share of the work each muscle does, for the Guide tab's body map.
 * The main muscle takes 60% and the helpers split the rest; with no helpers
 * the main muscle does it all. Shares add up to 100.
 */
export function muscleShare<M extends string>(primary: M, secondary: M[]): { muscle: M; pct: number }[] {
  const helpers = secondary.filter((m) => m !== primary);
  if (!helpers.length) return [{ muscle: primary, pct: 100 }];
  const each = Math.floor(40 / helpers.length);
  return [{ muscle: primary, pct: 100 - each * helpers.length }, ...helpers.map((muscle) => ({ muscle, pct: each }))];
}

/** Break a how-to paragraph into short steps, one sentence each. */
export function instructionSteps(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Reordering exercises mid-workout ----------

type Orderable = { order: number; supersetGroup: number | null; sets: { done: boolean }[] };

/** Exercises grouped so a superset moves as one: [[A], [B1, B2], [C]]. */
export function exerciseUnits<T extends Orderable>(blocks: T[]): T[][] {
  const units: T[][] = [];
  for (const b of blocks) {
    const last = units.at(-1);
    if (last && b.supersetGroup != null && last[0].supersetGroup === b.supersetGroup) last.push(b);
    else units.push([b]);
  }
  return units;
}

/**
 * Move an exercise (and its superset partners) so its group sits at `to`,
 * counted among the other groups: 0 is first, `units - 1` is last.
 */
export function moveUnit<T extends Orderable>(blocks: T[], order: number, to: number): T[] {
  const units = exerciseUnits(blocks);
  const i = units.findIndex((u) => u.some((b) => b.order === order));
  if (i < 0) return blocks;
  const [unit] = units.splice(i, 1);
  units.splice(Math.max(0, Math.min(to, units.length)), 0, unit);
  return units.flat();
}

/** Which group this exercise is in, counting supersets as one. */
export function unitIndex(blocks: Orderable[], order: number): number {
  return exerciseUnits(blocks).findIndex((u) => u.some((b) => b.order === order));
}

/**
 * Where "Do next" puts an exercise: straight after the one you're on, or in
 * its place if you haven't logged anything there yet. `current` is the
 * exercise you're on (null when there isn't one).
 */
export function doNextIndex(blocks: Orderable[], order: number, current: number | null): number {
  const units = exerciseUnits(blocks);
  const own = units.findIndex((u) => u.some((b) => b.order === order));
  const others = units.filter((_, i) => i !== own);
  const c = others.findIndex((u) => u.some((b) => b.order === current));
  if (c < 0) {
    if (current != null && units[own]?.some((b) => b.order === current)) return own; // already on it
    // Nothing in progress: go after the last exercise you've started.
    let last = -1;
    others.forEach((u, i) => u.some((b) => b.sets.some((s) => s.done)) && (last = i));
    return last + 1;
  }
  const started = others[c].some((b) => b.sets.some((s) => s.done));
  return started ? c + 1 : c;
}

/** The exercise you're working on, ignoring `except` (e.g. the one being moved). */
export function workingOn(blocks: Orderable[], focus: number | null, except?: number): number | null {
  const moving = new Set(exerciseUnits(blocks).find((u) => u.some((b) => b.order === except))?.map((b) => b.order));
  const open = (b: Orderable) => !moving.has(b.order) && b.sets.some((s) => !s.done);
  if (blocks.some((b) => b.order === focus && open(b))) return focus;
  return blocks.find(open)?.order ?? null;
}

/**
 * Pair each exercise in a routine workout with its plan row. Workouts start
 * numbered in plan order, but you can reorder them, so: same slot and
 * exercise first, then the first unclaimed plan row for that exercise.
 * Returns block order -> index into `targets`.
 */
export function matchTargets(
  targets: { position: number; exercise_id: string }[],
  blocks: { order: number; exerciseId: string }[],
): Map<number, number> {
  const out = new Map<number, number>();
  const used = new Set<number>();
  for (const b of blocks) {
    const t = targets.findIndex((x) => x.position === b.order && x.exercise_id === b.exerciseId);
    if (t >= 0 && !used.has(t)) {
      out.set(b.order, t);
      used.add(t);
    }
  }
  for (const b of blocks) {
    if (out.has(b.order)) continue;
    const t = targets.findIndex((x, i) => !used.has(i) && x.exercise_id === b.exerciseId);
    if (t >= 0) {
      out.set(b.order, t);
      used.add(t);
    }
  }
  return out;
}

/**
 * A set logged on the watch, as two patches: what the logger rows show (text, in
 * your unit) and what gets saved (numbers, weight in kg).
 */
export function watchSetPatch(
  data: { weightKg?: number | null; reps?: number | null; rpe?: number | null },
  unit: UnitSystem,
): {
  ui: { weight?: string; reps?: string; rpe?: number };
  db: { weight?: number; reps?: number; rpe?: number };
} {
  const ui: { weight?: string; reps?: string; rpe?: number } = {};
  const db: { weight?: number; reps?: number; rpe?: number } = {};
  if (data.weightKg != null) {
    ui.weight = weightInput(data.weightKg, unit);
    db.weight = data.weightKg;
  }
  if (data.reps != null) {
    ui.reps = String(data.reps);
    db.reps = data.reps;
  }
  if (data.rpe != null) {
    ui.rpe = data.rpe;
    db.rpe = data.rpe;
  }
  return { ui, db };
}

/**
 * Weight lifted so far: weight x reps for every done set that isn't a warm-up,
 * in the same unit the weights are typed in (so no conversion is needed).
 * One-sided sets count both sides.
 */
export function liveVolume(
  blocks: { sets: { done: boolean; type: SetType; weight: string; reps: string; repsLeft?: string }[] }[],
): number {
  let total = 0;
  for (const b of blocks)
    for (const s of b.sets) {
      if (!s.done || s.type === "warmup") continue;
      const weight = parseNumber(s.weight) ?? 0;
      total += weight * ((parseNumber(s.reps) ?? 0) + (parseNumber(s.repsLeft ?? "") ?? 0));
    }
  return Math.round(total * 10) / 10;
}
