// Pure maths for the Progress overview: weekly comparisons, the calendar,
// streaks, muscle breakdown, top lifts, the Progress Index, insights and
// period comparisons. Weights are whatever unit you pass in.

import { bestE1rm } from "./workout-logic.ts";

export interface StatSession {
  id: string;
  name: string | null;
  start_time: string;
  end_time: string | null;
  volume: number;
}

export interface StatSet {
  session_id: string;
  exercise_id: string;
  set_type: string;
  weight: number;
  reps: number;
  completed_at: string | null;
}

const DAY = 86_400_000;

/** Monday 00:00 local time of the week containing t. */
export function weekStart(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

const minutesOf = (s: StatSession) => (s.end_time ? Math.max(0, (Date.parse(s.end_time) - Date.parse(s.start_time)) / 60000) : 0);
const pct = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

/**
 * This week so far against last week up to the same point, so a Tuesday
 * isn't compared with a whole week. pct is null when last week had nothing.
 */
export function thisWeek(sessions: StatSession[], now = Date.now()) {
  const start = weekStart(now);
  const elapsed = now - start;
  const prevStart = start - 7 * DAY;
  const inRange = (a: number, b: number) => sessions.filter((s) => Date.parse(s.start_time) >= a && Date.parse(s.start_time) < b);
  const cur = inRange(start, now + 1);
  const prev = inRange(prevStart, prevStart + elapsed + 1);
  const sum = (xs: StatSession[], f: (s: StatSession) => number) => xs.reduce((t, s) => t + f(s), 0);
  const volume = sum(cur, (s) => s.volume);
  const minutes = Math.round(sum(cur, minutesOf));
  return {
    workouts: cur.length,
    volume,
    minutes,
    volumePct: pct(volume, sum(prev, (s) => s.volume)),
    minutesPct: pct(minutes, Math.round(sum(prev, minutesOf))),
  };
}

/** Local yyyy-mm-dd, used to match workouts to calendar days. */
export function dayKey(t: number | string): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A month as weeks of 7 days (Monday first); days outside the month are null. */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/**
 * Weeks in a row with at least one workout. This week counts once you've
 * trained; before that the streak runs up to last week, so Monday morning
 * doesn't break it.
 */
export function weekStreak(sessions: StatSession[], now = Date.now()): number {
  const weeks = new Set(sessions.map((s) => weekStart(Date.parse(s.start_time))));
  let w = weekStart(now);
  if (!weeks.has(w)) w = weekStart(w - DAY);
  let streak = 0;
  while (weeks.has(w)) {
    streak++;
    w = weekStart(w - DAY);
  }
  return streak;
}

/** Share of working sets per group, biggest first. groupOf maps an exercise to its group. */
export function muscleBreakdown(sets: StatSet[], groupOf: (exerciseId: string) => string | undefined) {
  const counts = new Map<string, number>();
  let total = 0;
  for (const s of sets) {
    if (s.set_type === "warmup") continue;
    const g = groupOf(s.exercise_id);
    if (!g) continue;
    counts.set(g, (counts.get(g) ?? 0) + 1);
    total++;
  }
  return [...counts.entries()]
    .map(([group, n]) => ({ group, sets: n, pct: total ? Math.round((n / total) * 100) : 0 }))
    .sort((a, b) => b.sets - a.sets);
}

/** Best estimated 1RM per exercise (working sets only), highest first. */
export function topE1rms(sets: StatSet[], limit = 5) {
  const best = new Map<string, { exerciseId: string; e1rm: number; weight: number; reps: number; at: string | null }>();
  for (const s of sets) {
    if (s.set_type === "warmup") continue;
    const e = bestE1rm([s]);
    if (e > (best.get(s.exercise_id)?.e1rm ?? 0)) best.set(s.exercise_id, { exerciseId: s.exercise_id, e1rm: e, weight: s.weight, reps: s.reps, at: s.completed_at });
  }
  return [...best.values()].sort((a, b) => b.e1rm - a.e1rm).slice(0, limit);
}

/**
 * Progress Index: are you getting stronger overall? For every lift you've
 * done in at least 3 different weeks, take your best estimated 1RM so far
 * each week and divide by your best in the first week you did it. The index
 * is the average of those ratios × 100: 100 = where you started, 108 = about
 * 8% stronger. Returns one point per week, oldest first.
 */
export function progressIndex(sets: StatSet[], weeks = 12, now = Date.now()): { week: number; value: number }[] {
  const first = weekStart(now) - (weeks - 1) * 7 * DAY;
  const byEx = new Map<string, Map<number, number>>(); // exercise -> week -> best e1rm that week
  for (const s of sets) {
    if (s.set_type === "warmup" || !s.completed_at) continue;
    const w = weekStart(Date.parse(s.completed_at));
    if (w < first) continue;
    const e = bestE1rm([s]);
    if (!e) continue;
    const m = byEx.get(s.exercise_id) ?? new Map<number, number>();
    m.set(w, Math.max(m.get(w) ?? 0, e));
    byEx.set(s.exercise_id, m);
  }
  const lifts = [...byEx.values()].filter((m) => m.size >= 3);
  if (!lifts.length) return [];
  const out: { week: number; value: number }[] = [];
  for (let i = 0; i < weeks; i++) {
    const w = first + i * 7 * DAY;
    const ratios: number[] = [];
    for (const m of lifts) {
      const done = [...m.entries()].filter(([wk]) => wk <= w).sort((a, b) => a[0] - b[0]);
      if (!done.length) continue;
      const base = done[0][1];
      const bestSoFar = Math.max(...done.map(([, e]) => e));
      ratios.push(bestSoFar / base);
    }
    if (ratios.length) out.push({ week: w, value: Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 1000) / 10 });
  }
  return out;
}

export interface PeriodTotals {
  workouts: number;
  minutes: number;
  volume: number;
  sets: number;
  avgMinutes: number;
}

/** Totals for workouts that started in [from, to). */
export function periodTotals(sessions: StatSession[], sets: StatSet[], from: number, to: number): PeriodTotals {
  const inside = sessions.filter((s) => Date.parse(s.start_time) >= from && Date.parse(s.start_time) < to);
  const ids = new Set(inside.map((s) => s.id));
  const minutes = Math.round(inside.reduce((t, s) => t + minutesOf(s), 0));
  return {
    workouts: inside.length,
    minutes,
    volume: inside.reduce((t, s) => t + s.volume, 0),
    sets: sets.filter((s) => ids.has(s.session_id) && s.set_type !== "warmup").length,
    avgMinutes: inside.length ? Math.round(minutes / inside.length) : 0,
  };
}

export const COMPARISONS = [
  { key: "week", label: "This week vs last week" },
  { key: "month", label: "This month vs last month" },
  { key: "30d", label: "Last 30 days vs the 30 before" },
] as const;
export type Comparison = (typeof COMPARISONS)[number]["key"];

/** [current from, current to, previous from, previous to] for a comparison; current runs to now. */
export function comparisonRanges(kind: Comparison, now = Date.now()): [number, number, number, number] {
  if (kind === "week") {
    const s = weekStart(now);
    return [s, now + 1, s - 7 * DAY, s];
  }
  if (kind === "month") {
    const d = new Date(now);
    const s = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const p = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    return [s, now + 1, p, s];
  }
  return [now - 30 * DAY, now + 1, now - 60 * DAY, now - 30 * DAY];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Plain-English observations from the last 8 weeks. Rules, not guesses:
 * each one only appears when there's enough data behind it.
 */
export function insights(
  sessions: StatSession[],
  sets: StatSet[],
  opts: { groupOf: (exerciseId: string) => string | undefined; nameOf: (exerciseId: string) => string | undefined; unit: string },
  now = Date.now(),
): string[] {
  const out: string[] = [];
  const since = now - 56 * DAY;
  const recent = sessions.filter((s) => Date.parse(s.start_time) >= since);
  if (recent.length < 3) return out;

  // How often
  const perWeek = Math.round((recent.length / 8) * 10) / 10;
  out.push(`You've averaged ${perWeek} ${perWeek === 1 ? "workout" : "workouts"} a week over the last 8 weeks.`);

  // Favourite days
  const byDay = new Map<number, number>();
  recent.forEach((s) => byDay.set(new Date(s.start_time).getDay(), (byDay.get(new Date(s.start_time).getDay()) ?? 0) + 1));
  const days = [...byDay.entries()].sort((a, b) => b[1] - a[1]);
  if (days[0][1] >= 3) {
    const top = days.filter(([, n]) => n >= Math.max(3, days[0][1] - 1)).slice(0, 2).map(([d]) => WEEKDAYS[d]);
    out.push(`You train most on ${top.join(" and ")}s.`);
  }

  // Length
  const lengths = recent.map(minutesOf).filter((m) => m > 0);
  if (lengths.length >= 3) out.push(`Your workouts last ${Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)} minutes on average.`);

  // Volume trend: last 4 weeks vs the 4 before
  const cur = periodTotals(sessions, sets, now - 28 * DAY, now + 1);
  const prev = periodTotals(sessions, sets, now - 56 * DAY, now - 28 * DAY);
  const change = pct(cur.volume, prev.volume);
  if (change != null && Math.abs(change) >= 5) {
    out.push(`Your training volume is ${change > 0 ? "up" : "down"} ${Math.abs(change)}% compared with the 4 weeks before.`);
  }

  // Lagging group
  const recentIds = new Set(recent.map((s) => s.id));
  const breakdown = muscleBreakdown(sets.filter((s) => recentIds.has(s.session_id)), opts.groupOf);
  const legs = breakdown.find((b) => b.group === "Legs");
  const total = breakdown.reduce((t, b) => t + b.sets, 0);
  if (total >= 30) {
    if (!legs || legs.pct < 15) out.push(`Legs got only ${legs?.pct ?? 0}% of your working sets. Most balanced plans give them 25–35%.`);
    const low = breakdown.at(-1);
    if (low && low.group !== "Legs" && low.pct < 8) out.push(`${low.group} is your least-trained area at ${low.pct}% of sets.`);
  }

  // Biggest gain
  const gains = new Map<string, { first: number; best: number }>();
  for (const s of [...sets].filter((s) => s.completed_at && Date.parse(s.completed_at) >= since).sort((a, b) => a.completed_at!.localeCompare(b.completed_at!))) {
    if (s.set_type === "warmup") continue;
    const e = bestE1rm([s]);
    if (!e) continue;
    const g = gains.get(s.exercise_id);
    if (!g) gains.set(s.exercise_id, { first: e, best: e });
    else g.best = Math.max(g.best, e);
  }
  const top = [...gains.entries()].map(([id, g]) => ({ id, up: g.best - g.first })).sort((a, b) => b.up - a.up)[0];
  const name = top && opts.nameOf(top.id);
  if (top && name && top.up >= 1) out.push(`${name} is your fastest-growing lift: estimated 1RM up ${Math.round(top.up)} ${opts.unit} in 8 weeks.`);

  return out;
}
