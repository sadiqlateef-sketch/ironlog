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
