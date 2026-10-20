// Pure maths behind the Progress insights: lift goals with countdowns,
// strength levels, plateaus, streaks and consistency, and the daily strain
// score. Weights are whatever unit you pass in unless a name says kg.

import { bestE1rm } from "./workout-logic.ts";
import { dayKey, weekStart, weekStreak, type StatSession, type StatSet } from "./stats.ts";

const DAY = 86_400_000;
const WEEK = 7 * DAY;

// ---------------- Per-workout bests ----------------

export interface SessionBest {
  sessionId: string;
  /** When the workout's first set of this lift was ticked off. */
  at: number;
  e1rm: number;
  weight: number;
  reps: number;
}

/** Each workout's best estimated 1RM for one lift (working sets only), oldest first. */
export function sessionBests(sets: StatSet[], exerciseId: string): SessionBest[] {
  const by = new Map<string, SessionBest>();
  for (const s of sets) {
    if (s.exercise_id !== exerciseId || s.set_type === "warmup" || !s.completed_at) continue;
    const t = Date.parse(s.completed_at);
    const e = bestE1rm([s]);
    const cur = by.get(s.session_id);
    if (!cur) {
      if (e) by.set(s.session_id, { sessionId: s.session_id, at: t, e1rm: e, weight: s.weight, reps: s.reps });
      continue;
    }
    cur.at = Math.min(cur.at, t);
    if (e > cur.e1rm) Object.assign(cur, { e1rm: e, weight: s.weight, reps: s.reps });
  }
  return [...by.values()].sort((a, b) => a.at - b.at);
}

/** Least-squares slope of value over time, per week. Null with fewer than 2 points or under a week of data. */
export function slopePerWeek(points: { at: number; value: number }[]): number | null {
  if (points.length < 2) return null;
  const span = points.at(-1)!.at - points[0].at;
  if (span < WEEK) return null;
  const xs = points.map((p) => (p.at - points[0].at) / WEEK);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = points.reduce((a, p) => a + p.value, 0) / points.length;
  let num = 0;
  let den = 0;
  points.forEach((p, i) => {
    num += (xs[i] - mx) * (p.value - my);
    den += (xs[i] - mx) ** 2;
  });
  return den ? num / den : null;
}

// ---------------- Lift goals ----------------

export type GoalState = "reached" | "on_track" | "behind" | "overdue" | "no_date" | "no_pace";

export interface GoalStatus {
  current: number;
  start: number;
  /** 0–100, how far from the starting point to the goal. */
  pct: number;
  remaining: number;
  /** Whole days until the goal date (0 = today). Null without a date. */
  daysLeft: number | null;
  /** Gain per week still needed to make the date. */
  neededPerWeek: number | null;
  /** Your recent gain per week (last 8 weeks of workouts). */
  pacePerWeek: number | null;
  /** When you'd get there at your current pace, if you're gaining. */
  eta: number | null;
  state: GoalState;
}

/** Midnight at the end of a yyyy-mm-dd day, local time. */
const endOfDay = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d + 1).getTime();
};

/**
 * Where you stand on a lift goal. The goal is an estimated 1RM; `start` is
 * your best when you set it (falls back to your first logged workout).
 */
export function goalStatus(
  goal: number,
  bests: SessionBest[],
  opts: { start?: number | null; due?: string | null; now?: number } = {},
): GoalStatus {
  const now = opts.now ?? Date.now();
  const current = bests.reduce((m, b) => Math.max(m, b.e1rm), 0);
  const start = opts.start ?? bests[0]?.e1rm ?? current;
  const remaining = Math.max(0, goal - current);
  const pct = current >= goal ? 100 : goal > start ? Math.max(0, Math.min(100, ((current - start) / (goal - start)) * 100)) : 0;
  const recent = bests.filter((b) => b.at >= now - 56 * DAY).map((b) => ({ at: b.at, value: b.e1rm }));
  const pace = slopePerWeek(recent);
  const daysLeft = opts.due ? Math.ceil((endOfDay(opts.due) - now) / DAY) - 1 : null;
  const weeksLeft = daysLeft != null ? (daysLeft + 1) / 7 : null;
  const neededPerWeek = remaining > 0 && weeksLeft != null && weeksLeft > 0 ? remaining / weeksLeft : null;
  const eta = remaining > 0 && pace && pace > 0 ? now + (remaining / pace) * WEEK : null;

  let state: GoalState;
  if (remaining <= 0) state = "reached";
  else if (daysLeft == null) state = "no_date";
  else if (daysLeft < 0) state = "overdue";
  else if (pace == null) state = "no_pace";
  else state = neededPerWeek != null && pace >= neededPerWeek ? "on_track" : "behind";

  return { current, start, pct: Math.round(pct), remaining, daysLeft, neededPerWeek, pacePerWeek: pace, eta, state };
}

// ---------------- Strength levels ----------------

export type Lift = "squat" | "bench" | "deadlift" | "press" | "row";
export const LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"] as const;

/**
 * Estimated 1RM as a multiple of bodyweight for each level. Rounded from
 * common published strength standards for adult lifters; a guide, not a test.
 */
const STANDARDS: Record<"male" | "female", Record<Lift, number[]>> = {
  male: {
    squat: [0.75, 1.25, 1.5, 2.25, 2.75],
    bench: [0.5, 0.75, 1.0, 1.5, 2.0],
    deadlift: [1.0, 1.5, 2.0, 2.5, 3.0],
    press: [0.35, 0.55, 0.75, 1.0, 1.35],
    row: [0.5, 0.75, 1.0, 1.5, 1.75],
  },
  female: {
    squat: [0.5, 0.75, 1.25, 1.5, 2.0],
    bench: [0.25, 0.5, 0.75, 1.0, 1.5],
    deadlift: [0.5, 1.0, 1.25, 1.75, 2.5],
    press: [0.2, 0.35, 0.5, 0.75, 1.0],
    row: [0.25, 0.4, 0.65, 0.9, 1.2],
  },
};

const LIFT_SLUGS: Record<Lift, string[]> = {
  squat: ["back-squat", "barbell-full-squat", "barbell-squat", "squat", "low-bar-squat", "high-bar-squat"],
  bench: ["bench-press", "barbell-bench-press", "barbell-bench-press-medium-grip", "bench-press-powerlifting"],
  deadlift: ["conventional-deadlift", "deadlift", "barbell-deadlift", "sumo-deadlift"],
  press: ["overhead-press", "barbell-shoulder-press", "standing-military-press", "military-press"],
  row: ["barbell-row", "pendlay-row", "bent-over-barbell-row"],
};

export const LIFT_LABELS: Record<Lift, string> = { squat: "Squat", bench: "Bench press", deadlift: "Deadlift", press: "Overhead press", row: "Barbell row" };

/** Which standard lift an exercise counts as, from its slug. */
export function liftFor(slug: string): Lift | null {
  for (const [lift, slugs] of Object.entries(LIFT_SLUGS) as [Lift, string[]][]) if (slugs.includes(slug)) return lift;
  return null;
}

export interface StrengthLevel {
  ratio: number;
  /** -1 = not yet Beginner, 0..4 = LEVELS index. Null when sex isn't set. */
  index: number | null;
  level: string | null;
  next: { level: string; ratio: number } | null;
  /** 0–100 of the way from this level to the next. */
  toNext: number | null;
}

export function strengthLevel(lift: Lift, e1rmKg: number, bodyweightKg: number, sex: string | null | undefined): StrengthLevel {
  const ratio = bodyweightKg > 0 ? e1rmKg / bodyweightKg : 0;
  if (sex !== "male" && sex !== "female") return { ratio, index: null, level: null, next: null, toNext: null };
  const t = STANDARDS[sex][lift];
  let index = -1;
  t.forEach((v, i) => ratio >= v && (index = i));
  const next = index < t.length - 1 ? { level: LEVELS[index + 1], ratio: t[index + 1] } : null;
  const from = index >= 0 ? t[index] : 0;
  const toNext = next ? Math.round(Math.max(0, Math.min(1, (ratio - from) / (next.ratio - from))) * 100) : 100;
  return { ratio, index, level: index >= 0 ? LEVELS[index] : "Getting started", next, toNext };
}

// ---------------- Plateaus ----------------

export interface Plateau {
  exerciseId: string;
  /** Workouts in a row without beating your best. */
  stalled: number;
  best: number;
  last: number;
  /** When you last set a best. */
  bestAt: number;
  fix: { title: string; detail: string };
}

/**
 * Lifts you've done 3+ workouts in a row without a new best estimated 1RM
 * (by at least 0.5%), and trained in the last 4 weeks. Worst first.
 */
export function findPlateaus(sets: StatSet[], opts: { unit: string; now?: number; minStalled?: number } ): Plateau[] {
  const now = opts.now ?? Date.now();
  const min = opts.minStalled ?? 3;
  const out: Plateau[] = [];
  for (const id of new Set(sets.map((s) => s.exercise_id))) {
    const bests = sessionBests(sets, id);
    if (bests.length < min + 1 || bests.at(-1)!.at < now - 28 * DAY) continue;
    let top = bests[0];
    for (const b of bests.slice(1)) if (b.e1rm > top.e1rm * 1.005) top = b;
    const stalled = bests.length - 1 - bests.indexOf(top);
    if (stalled < min) continue;
    const since = bests.slice(bests.indexOf(top) + 1);
    const last = bests.at(-1)!;
    const perMonth = bests.filter((b) => b.at >= now - 28 * DAY).length;
    out.push({ exerciseId: id, stalled, best: top.e1rm, last: last.e1rm, bestAt: top.at, fix: plateauFix(since, top.e1rm, stalled, perMonth, opts.unit) });
  }
  return out.sort((a, b) => b.stalled - a.stalled);
}

function plateauFix(since: SessionBest[], best: number, stalled: number, perMonth: number, unit: string) {
  const last = since.at(-1)!;
  const small = unit === "kg" ? "1 kg" : "2.5 lb";
  if (last.e1rm < best * 0.95) {
    return {
      title: "Take a lighter week",
      detail: "Your last workout was more than 5% under your best, which usually means you're tired, not weaker. Take about 10% off for a week, sleep well, then build back up.",
    };
  }
  if (stalled >= 5) {
    return {
      title: "Reset and build back",
      detail: `${stalled} workouts without a new best. Drop the weight about 10% and add a little each workout; most people pass their old best within 3 weeks.`,
    };
  }
  if (perMonth < 4) {
    return { title: "Train it more often", detail: "You've done this lift less than once a week lately. Twice a week gives it more practice and more chances to progress." };
  }
  const reps = since.map((b) => b.reps);
  if (Math.max(...reps) - Math.min(...reps) <= 1) {
    const r = reps[0];
    return {
      title: "Change the rep range",
      detail: `You've done about ${r} reps every time. Try 3 weeks of ${r >= 7 ? "heavier sets of 4–6" : "lighter sets of 8–12"}; the change often breaks the stall.`,
    };
  }
  return { title: "Use smaller jumps", detail: `Add just ${small} next time instead of a full jump, or add one rep a workout before adding weight.` };
}

// ---------------- Streaks and consistency ----------------

export interface StreakStats {
  /** Weeks in a row with a workout (this week counts once you've trained). */
  current: number;
  longest: number;
  /** Weeks in a row hitting your weekly target; null without a target. */
  onTarget: number | null;
  /** Days you trained in the last 30. */
  activeDays30: number;
}

export function streakStats(sessions: StatSession[], targetPerWeek: number | null, now = Date.now()): StreakStats {
  const perWeek = new Map<number, number>();
  for (const s of sessions) {
    const w = weekStart(Date.parse(s.start_time));
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const weeks = [...perWeek.keys()].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const w of weeks) {
    // Weeks aren't always exactly 7 days apart (clock changes), so step by the calendar.
    run = prev != null && weekStart(prev + 8 * DAY) === w ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = w;
  }
  let onTarget: number | null = null;
  if (targetPerWeek && targetPerWeek > 0) {
    onTarget = 0;
    let w = weekStart(now);
    if ((perWeek.get(w) ?? 0) < targetPerWeek) w = weekStart(w - DAY); // this week is still in progress
    while ((perWeek.get(w) ?? 0) >= targetPerWeek) {
      onTarget++;
      w = weekStart(w - DAY);
    }
  }
  const days = new Set(sessions.filter((s) => Date.parse(s.start_time) >= now - 30 * DAY).map((s) => dayKey(s.start_time)));
  return { current: weekStreak(sessions, now), longest, onTarget, activeDays30: days.size };
}

export interface HeatCell {
  key: string;
  date: number;
  workouts: number;
  /** 0 = rest, 1–4 = how much volume compared with your other training days. */
  level: number;
  future: boolean;
}

/**
 * The last `weeks` weeks as columns of 7 days (Monday first), oldest first,
 * for a consistency heatmap. Busy days are graded against your own training
 * days by volume, in quartiles.
 */
export function consistencyGrid(sessions: StatSession[], weeks = 26, now = Date.now()): HeatCell[][] {
  const byDay = new Map<string, { n: number; v: number }>();
  for (const s of sessions) {
    const k = dayKey(s.start_time);
    const d = byDay.get(k) ?? { n: 0, v: 0 };
    d.n++;
    d.v += s.volume;
    byDay.set(k, d);
  }
  const vols = [...byDay.values()].map((d) => d.v).sort((a, b) => a - b);
  const q = (p: number) => vols[Math.min(vols.length - 1, Math.floor(p * vols.length))] ?? 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const today = dayKey(now);
  const first = weekStart(now) - (weeks - 1) * WEEK;
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const base = new Date(first);
      base.setDate(base.getDate() + w * 7 + d);
      const key = dayKey(base.getTime());
      const day = byDay.get(key);
      const level = !day ? 0 : 1 + cuts.filter((c) => day.v > c).length;
      return { key, date: base.getTime(), workouts: day?.n ?? 0, level, future: key > today };
    }),
  );
}

export interface MonthConsistency {
  year: number;
  month: number;
  workouts: number;
  /** Workouts your weekly target asks for in this month (so far, for this month). */
  planned: number | null;
  /** 0–100 of planned; null without a target. */
  pct: number | null;
}

/** Workouts per month against your weekly target, newest month first. */
export function monthConsistency(sessions: StatSession[], targetPerWeek: number | null, months = 6, now = Date.now()): MonthConsistency[] {
  const d = new Date(now);
  return Array.from({ length: months }, (_, i) => {
    const from = new Date(d.getFullYear(), d.getMonth() - i, 1).getTime();
    const end = new Date(d.getFullYear(), d.getMonth() - i + 1, 1).getTime();
    const to = Math.min(end, now + 1);
    const workouts = sessions.filter((s) => {
      const t = Date.parse(s.start_time);
      return t >= from && t < to;
    }).length;
    const days = Math.max(1, Math.round((to - from) / DAY));
    const planned = targetPerWeek ? Math.max(1, Math.round((targetPerWeek * days) / 7)) : null;
    const m = new Date(from);
    return { year: m.getFullYear(), month: m.getMonth(), workouts, planned, pct: planned ? Math.min(100, Math.round((workouts / planned) * 100)) : null };
  });
}

// ---------------- Daily strain ----------------

export interface HrSample {
  t: number;
  bpm: number;
}

export interface StrainSet {
  set_type: string;
  reps: number;
  rpe: number | null;
}

/** Your max heart rate: what you entered, else 220 minus age, else 190. */
export function maxHrFor(stats: { max_hr?: number; birth_year?: number } | null | undefined, now = Date.now()): number {
  if (stats?.max_hr && stats.max_hr > 100) return stats.max_hr;
  if (stats?.birth_year) return 220 - (new Date(now).getFullYear() - stats.birth_year);
  return 190;
}

/** Heart-rate zone 0–5 (0 = under 50% of max). */
export const hrZone = (bpm: number, maxHr: number) => {
  const p = bpm / maxHr;
  return p < 0.5 ? 0 : p < 0.6 ? 1 : p < 0.7 ? 2 : p < 0.8 ? 3 : p < 0.9 ? 4 : 5;
};

export interface CardioLoad {
  /** Zone-weighted minutes (Edwards TRIMP). */
  load: number;
  /** Minutes in zones 1–5. */
  zones: number[];
  avgHr: number | null;
  peakHr: number | null;
  /** "watch" from heart-rate samples, "summary" from the average only, "time" when there was no heart rate. */
  source: "watch" | "summary" | "time";
}

/**
 * Heart-rate load for one workout. Each sample counts until the next one
 * (at most 2 minutes, so gaps in the watch data don't inflate it).
 */
export function cardioLoad(minutes: number, samples: HrSample[], avgHr: number | null, maxHr: number): CardioLoad {
  const zones = [0, 0, 0, 0, 0];
  const s = [...samples].sort((a, b) => a.t - b.t);
  if (s.length >= 2) {
    let load = 0;
    for (let i = 0; i < s.length; i++) {
      const next = s[i + 1]?.t ?? s[i].t + 5000;
      const min = Math.min(next - s[i].t, 120_000) / 60_000;
      const z = hrZone(s[i].bpm, maxHr);
      if (z) {
        zones[z - 1] += min;
        load += min * z;
      }
    }
    const avg = Math.round(s.reduce((t, x) => t + x.bpm, 0) / s.length);
    return { load, zones, avgHr: avg, peakHr: Math.max(...s.map((x) => x.bpm)), source: "watch" };
  }
  if (avgHr) {
    const z = hrZone(avgHr, maxHr);
    if (z) zones[z - 1] = minutes;
    return { load: minutes * z, zones, avgHr, peakHr: null, source: "summary" };
  }
  // No heart rate: assume an easy zone 1–2 effort for the time you were there.
  return { load: minutes * 1.5, zones, avgHr: null, peakHr: null, source: "time" };
}

export interface MuscularLoad {
  load: number;
  sets: number;
  /** Average RPE of the working sets that have one; null when none do. */
  avgRpe: number | null;
}

/**
 * Lifting load: working sets weighted by effort. RPE 9 counts as 1, RPE 6 as
 * 0.5; sets without an RPE count as a typical 0.75 (about RPE 7.5).
 */
export function muscularLoad(sets: StrainSet[]): MuscularLoad {
  let load = 0;
  let n = 0;
  const rpes: number[] = [];
  for (const s of sets) {
    if (s.set_type === "warmup") continue;
    n++;
    if (s.rpe != null && s.rpe > 0) {
      rpes.push(s.rpe);
      load += Math.min(1.2, Math.max(0.3, (s.rpe - 3) / 6));
    } else load += 0.75;
  }
  return { load, sets: n, avgRpe: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null };
}

/**
 * Strain 0–100 from heart-rate load and lifting load. It saturates, so
 * doubling an already hard day adds less than the first hour did.
 * A typical hour of lifting lands around 55–65.
 */
export function strainScore(cardio: number, muscular: number): number {
  return Math.round(100 * (1 - Math.exp(-(cardio / 250 + muscular / 30))));
}

export function strainBand(score: number): { label: string; note: string } {
  if (score < 35) return { label: "Light", note: "An easy day. Good for recovery." };
  if (score < 65) return { label: "Moderate", note: "A solid training day." };
  if (score < 85) return { label: "High", note: "A hard day. Plan an easier one soon." };
  return { label: "All-out", note: "Very hard. Give the muscles you worked 48 hours." };
}

export interface DayStrain {
  key: string;
  score: number;
  cardio: number;
  muscular: number;
  workouts: number;
}

/** Sums each day's workout loads and scores the day. */
export function dailyStrain(workouts: { start: number; cardio: number; muscular: number }[]): Map<string, DayStrain> {
  const out = new Map<string, DayStrain>();
  for (const w of workouts) {
    const k = dayKey(w.start);
    const d = out.get(k) ?? { key: k, score: 0, cardio: 0, muscular: 0, workouts: 0 };
    d.cardio += w.cardio;
    d.muscular += w.muscular;
    d.workouts++;
    d.score = strainScore(d.cardio, d.muscular);
    out.set(k, d);
  }
  return out;
}

export interface WorkoutStrain {
  cardio: CardioLoad;
  muscular: MuscularLoad;
  score: number;
  minutes: number;
}

/** Strain for one finished workout from its heart rate and sets. */
export function workoutStrain(
  session: { start_time: string; end_time: string | null; avg_hr?: number | null },
  samples: HrSample[],
  sets: StrainSet[],
  maxHr: number,
): WorkoutStrain {
  const minutes = session.end_time ? Math.max(0, (Date.parse(session.end_time) - Date.parse(session.start_time)) / 60_000) : 0;
  const cardio = cardioLoad(minutes, samples, session.avg_hr ?? null, maxHr);
  const muscular = muscularLoad(sets);
  return { cardio, muscular, score: strainScore(cardio.load, muscular.load), minutes };
}

// ---------------- Best sets (exercise detail) ----------------

export interface BestSetDay {
  sessionId: string;
  date: string;
  sets: { set_type: string; weight: number; reps: number; completed_at?: string | null }[];
}

export interface BestSets {
  e1rm: { value: number; weight: number; reps: number; date: string } | null;
  heaviest: { weight: number; reps: number; date: string } | null;
  mostReps: { weight: number; reps: number; date: string } | null;
  volume: { value: number; date: string } | null;
  /** Heaviest weight you've lifted for at least this many reps. */
  repMaxes: { reps: number; weight: number; date: string }[];
}

export const REP_MAX_COUNTS = [1, 3, 5, 8, 10, 12];

/** Your all-time bests on one lift from its workout history (working sets only). */
export function bestSets(days: BestSetDay[]): BestSets {
  const out: BestSets = { e1rm: null, heaviest: null, mostReps: null, volume: null, repMaxes: [] };
  const rm = new Map<number, { weight: number; date: string }>();
  for (const d of days) {
    let vol = 0;
    for (const s of d.sets) {
      if (s.set_type === "warmup" || s.reps <= 0) continue;
      vol += s.weight * s.reps;
      const e = bestE1rm([s]);
      if (e > (out.e1rm?.value ?? 0)) out.e1rm = { value: e, weight: s.weight, reps: s.reps, date: d.date };
      if (s.weight > (out.heaviest?.weight ?? 0) || (s.weight === out.heaviest?.weight && s.reps > out.heaviest.reps))
        out.heaviest = { weight: s.weight, reps: s.reps, date: d.date };
      if (s.reps > (out.mostReps?.reps ?? 0) || (s.reps === out.mostReps?.reps && s.weight > out.mostReps.weight))
        out.mostReps = { weight: s.weight, reps: s.reps, date: d.date };
      if (s.weight > 0) for (const r of REP_MAX_COUNTS) if (s.reps >= r && s.weight > (rm.get(r)?.weight ?? 0)) rm.set(r, { weight: s.weight, date: d.date });
    }
    if (vol > (out.volume?.value ?? 0)) out.volume = { value: vol, date: d.date };
  }
  out.repMaxes = REP_MAX_COUNTS.filter((r) => rm.has(r)).map((r) => ({ reps: r, ...rm.get(r)! }));
  return out;
}

/** Exercise-detail history in the shape sessionBests and findPlateaus take. */
export function daysToStatSets(days: BestSetDay[], exerciseId: string): StatSet[] {
  return days.flatMap((d) =>
    d.sets.map((s) => ({ session_id: d.sessionId, exercise_id: exerciseId, set_type: s.set_type, weight: s.weight, reps: s.reps, completed_at: s.completed_at ?? d.date })),
  );
}
