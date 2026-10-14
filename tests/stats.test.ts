import { test } from "node:test";
import assert from "node:assert/strict";
import {
  comparisonRanges,
  formatDuration,
  sessionRecords,
  trainingSummary,
  dayKey,
  insights,
  monthGrid,
  muscleBreakdown,
  periodTotals,
  progressIndex,
  thisWeek,
  topE1rms,
  weekStart,
  weekStreak,
} from "../src/lib/stats.ts";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).getTime();
const sess = (id: string, t: number, minutes = 60, volume = 1000) => ({
  id, name: "W", start_time: new Date(t).toISOString(), end_time: new Date(t + minutes * 60000).toISOString(), volume,
});
const set = (session_id: string, exercise_id: string, weight: number, reps: number, t: number, set_type = "normal") => ({
  session_id, exercise_id, weight, reps, set_type, completed_at: new Date(t).toISOString(),
});

// Wed 14 Oct 2026
const NOW = at(2026, 9, 14, 18);

test("week starts on Monday", () => {
  assert.equal(new Date(weekStart(NOW)).getDay(), 1);
  assert.equal(new Date(weekStart(NOW)).getDate(), 12);
});

test("this week vs last week to the same weekday", () => {
  const s = [
    sess("a", at(2026, 9, 12), 60, 2000), // Mon this week
    sess("b", at(2026, 9, 5), 50, 1000), // Mon last week
    sess("c", at(2026, 9, 9), 40, 5000), // Fri last week: after the same point, ignored
  ];
  const w = thisWeek(s, NOW);
  assert.equal(w.workouts, 1);
  assert.equal(w.volume, 2000);
  assert.equal(w.volumePct, 100);
  assert.equal(w.minutesPct, 20);
});

test("month grid: Oct 2026 starts on Thursday", () => {
  const g = monthGrid(2026, 9);
  assert.equal(g[0].slice(0, 3).every((d) => d === null), true);
  assert.equal(g[0][3]!.getDate(), 1);
  assert.equal(g.flat().filter(Boolean).length, 31);
  assert.equal(dayKey(at(2026, 9, 3)), "2026-10-03");
});

test("streak counts weeks in a row; an empty current week doesn't break it", () => {
  const s = [sess("a", at(2026, 9, 6)), sess("b", at(2026, 8, 29)), sess("c", at(2026, 8, 15))];
  assert.equal(weekStreak(s, NOW), 2);
  assert.equal(weekStreak([...s, sess("d", at(2026, 9, 13))], NOW), 3);
  assert.equal(weekStreak([], NOW), 0);
});

test("muscle breakdown skips warm-ups", () => {
  const g = (id: string) => ({ bench: "Chest", squat: "Legs" })[id];
  const sets = [set("a", "bench", 100, 5, NOW), set("a", "bench", 60, 5, NOW, "warmup"), set("a", "squat", 100, 5, NOW), set("a", "squat", 100, 5, NOW), set("a", "squat", 100, 5, NOW)];
  assert.deepEqual(muscleBreakdown(sets, g), [
    { group: "Legs", sets: 3, pct: 75 },
    { group: "Chest", sets: 1, pct: 25 },
  ]);
});

test("top 1RMs highest first", () => {
  const t = topE1rms([set("a", "bench", 100, 5, NOW), set("a", "squat", 140, 3, NOW), set("a", "bench", 105, 3, NOW)]);
  assert.deepEqual(t.map((x) => x.exerciseId), ["squat", "bench"]);
  assert.equal(Math.round(t[1].e1rm), 117);
});

test("progress index: 10% stronger on the only lift", () => {
  const sets = [
    set("a", "bench", 100, 1, NOW - 21 * 86400000),
    set("b", "bench", 105, 1, NOW - 14 * 86400000),
    set("c", "bench", 110, 1, NOW - 1 * 86400000),
  ];
  const idx = progressIndex(sets, 4, NOW);
  assert.equal(idx[0].value, 100);
  assert.equal(idx.at(-1)!.value, 110);
  // A lift done in fewer than 3 weeks doesn't count
  assert.deepEqual(progressIndex(sets.slice(0, 2), 4, NOW), []);
});

test("period totals and ranges", () => {
  const s = [sess("a", at(2026, 9, 12), 60, 2000), sess("b", at(2026, 9, 1), 40, 1000)];
  const sets = [set("a", "bench", 100, 5, NOW), set("a", "bench", 60, 5, NOW, "warmup")];
  const [cf, ct, pf, pt] = comparisonRanges("month", NOW);
  assert.deepEqual(periodTotals(s, sets, cf, ct), { workouts: 2, minutes: 100, volume: 3000, sets: 1, avgMinutes: 50 });
  assert.equal(periodTotals(s, sets, pf, pt).workouts, 0);
  assert.equal(new Date(pf).getMonth(), 8);
});

test("insights need enough data and mention lagging legs", () => {
  assert.deepEqual(insights([], [], { groupOf: () => "Chest", nameOf: () => "Bench", unit: "lb" }, NOW), []);
  const s = Array.from({ length: 8 }, (_, i) => sess(`s${i}`, NOW - i * 7 * 86400000 - 3600000));
  const sets = s.flatMap((x, i) => Array.from({ length: 5 }, () => set(x.id, "bench", 100 + (8 - i) * 2, 5, Date.parse(x.start_time))));
  const out = insights(s, sets, { groupOf: () => "Chest", nameOf: () => "Bench Press", unit: "lb" }, NOW);
  assert.ok(out.some((t) => t.startsWith("You've averaged 1 workout a week")));
  assert.ok(out.some((t) => t.startsWith("Legs got only 0%")));
  assert.ok(out.some((t) => t.startsWith("Bench Press is your fastest-growing lift")));
});

test("session records only count beating an earlier workout", () => {
  const sessions = [
    { id: "a", start_time: "2026-10-01T10:00:00Z" },
    { id: "b", start_time: "2026-10-03T10:00:00Z" },
    { id: "c", start_time: "2026-10-05T10:00:00Z" },
  ];
  const set = (session_id: string, exercise_id: string, weight: number, reps: number, set_type = "normal") => ({
    session_id,
    exercise_id,
    set_type,
    weight,
    reps,
    completed_at: null,
  });
  const recs = sessionRecords(
    [
      set("a", "bench", 100, 5),
      set("a", "squat", 140, 5),
      set("b", "bench", 105, 5), // beats a
      set("b", "squat", 140, 5), // ties, no record
      set("b", "row", 80, 8), // first time, no record
      set("c", "bench", 200, 1, "warmup"), // warm-ups never count
      set("c", "squat", 150, 3), // 165 vs 163.3: record
    ],
    sessions,
  );
  assert.deepEqual([...recs.entries()], [
    ["b", ["bench"]],
    ["c", ["squat"]],
  ]);
});

test("training summary splits lifting, rest and idle", () => {
  const t = (min: number, sec = 0) => new Date(Date.UTC(2026, 9, 1, 10, min, sec)).toISOString();
  const session = { id: "s", name: "Push", start_time: t(0), end_time: t(30), volume: 1234 };
  const set = (at: string, reps: number, exercise_id = "bench", set_type = "normal") => ({
    session_id: "s",
    exercise_id,
    set_type,
    weight: 60,
    reps,
    completed_at: at,
  });
  const s = trainingSummary(session, [
    set(t(1), 10, "bench", "warmup"), // 60 s gap: 40 s lifting, 20 s rest
    set(t(4), 5), // 180 s gap: 20 s lifting, 160 s rest
    set(t(14), 5, "row"), // 600 s gap: 20 s lifting, 300 s rest, 280 s idle
  ]);
  assert.deepEqual(s, { totalSec: 1800, liftingSec: 80, restSec: 480, idleSec: 1240, exercises: 2, sets: 3, volume: 1234 });
  assert.equal(formatDuration(35), "35s");
  assert.equal(formatDuration(42 * 60), "42m");
  assert.equal(formatDuration(65 * 60), "1h 05m");
});
