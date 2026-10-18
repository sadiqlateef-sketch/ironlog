import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cardioLoad,
  consistencyGrid,
  dailyStrain,
  findPlateaus,
  goalStatus,
  liftFor,
  maxHrFor,
  monthConsistency,
  muscularLoad,
  sessionBests,
  slopePerWeek,
  strainBand,
  strainScore,
  streakStats,
  strengthLevel,
  workoutStrain,
  bestSets,
  daysToStatSets,
} from "../src/lib/insights.ts";

const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m, d, h).getTime();
// Wed 14 Oct 2026, evening
const NOW = at(2026, 9, 14, 18);
const sess = (id: string, t: number, volume = 1000) => ({
  id, name: "W", start_time: new Date(t).toISOString(), end_time: new Date(t + 3600_000).toISOString(), volume,
});
const set = (session_id: string, exercise_id: string, weight: number, reps: number, t: number, set_type = "normal") => ({
  session_id, exercise_id, weight, reps, set_type, completed_at: new Date(t).toISOString(),
});

test("sessionBests keeps each workout's best working set, oldest first", () => {
  const t = NOW - 10 * DAY;
  const b = sessionBests(
    [
      set("b", "bench", 100, 5, t + 3 * DAY),
      set("a", "bench", 200, 1, t, "warmup"),
      set("a", "bench", 90, 5, t),
      set("a", "bench", 95, 3, t + 60_000),
      set("a", "squat", 300, 5, t),
    ],
    "bench",
  );
  assert.deepEqual(b.map((x) => x.sessionId), ["a", "b"]);
  assert.equal(b[0].weight, 90);
  assert.equal(Math.round(b[0].e1rm), 105);
});

test("slope needs a week of data", () => {
  assert.equal(slopePerWeek([{ at: 0, value: 1 }]), null);
  assert.equal(slopePerWeek([{ at: 0, value: 1 }, { at: 3 * DAY, value: 2 }]), null);
  assert.equal(slopePerWeek([{ at: 0, value: 100 }, { at: 14 * DAY, value: 110 }]), 5);
});

test("goal status: on track, behind, reached, overdue, no date", () => {
  // +5 a week for 4 weeks: 100 -> 120
  const bests = [0, 1, 2, 3, 4].map((w) => ({ sessionId: String(w), at: NOW - (4 - w) * 7 * DAY, e1rm: 100 + w * 5, weight: 0, reps: 1 }));
  const due = (days: number) => {
    const d = new Date(NOW + days * DAY);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const ok = goalStatus(140, bests, { start: 100, due: due(34), now: NOW }); // 20 to go, ~5 weeks
  assert.equal(ok.state, "on_track");
  assert.equal(ok.pct, 50);
  assert.equal(ok.daysLeft, 34);
  assert.ok(Math.abs(ok.pacePerWeek! - 5) < 1e-9);
  assert.ok(ok.eta! > NOW);

  assert.equal(goalStatus(140, bests, { start: 100, due: due(14), now: NOW }).state, "behind");
  assert.equal(goalStatus(115, bests, { due: due(14), now: NOW }).state, "reached");
  assert.equal(goalStatus(115, bests, { now: NOW }).pct, 100);
  assert.equal(goalStatus(140, bests, { due: due(-2), now: NOW }).state, "overdue");
  assert.equal(goalStatus(140, bests, { now: NOW }).state, "no_date");
  assert.equal(goalStatus(140, [], { due: due(30), now: NOW }).state, "no_pace");
  assert.equal(goalStatus(140, bests, { due: due(0), now: NOW }).daysLeft, 0, "due today");
});

test("strength levels from bodyweight ratios", () => {
  assert.equal(liftFor("bench-press"), "bench");
  assert.equal(liftFor("conventional-deadlift"), "deadlift");
  assert.equal(liftFor("dumbbell-curl"), null);
  const l = strengthLevel("bench", 100, 80, "male"); // 1.25x
  assert.equal(l.level, "Intermediate");
  assert.equal(l.next?.level, "Advanced");
  assert.equal(l.toNext, 50);
  assert.equal(strengthLevel("bench", 30, 80, "male").level, "Getting started");
  assert.equal(strengthLevel("bench", 200, 80, "male").next, null);
  assert.equal(strengthLevel("bench", 60, 60, "female").level, "Advanced");
  const unknown = strengthLevel("squat", 100, 80, "other");
  assert.equal(unknown.level, null);
  assert.equal(unknown.ratio, 1.25);
});

test("plateaus: stalled 3+ workouts, recent, with a fitting fix", () => {
  const w = (i: number) => NOW - (7 - i) * 3 * DAY;
  const sets = [
    // bench: best at workout 2, then 3 flat workouts with 5 reps each
    set("1", "bench", 100, 5, w(1)), set("2", "bench", 105, 5, w(2)), set("3", "bench", 105, 5, w(3)),
    set("4", "bench", 104, 5, w(4)), set("5", "bench", 105, 5, w(5)),
    // squat: still climbing
    set("1", "squat", 100, 5, w(1)), set("2", "squat", 105, 5, w(2)), set("3", "squat", 110, 5, w(3)), set("4", "squat", 115, 5, w(4)),
  ];
  const p = findPlateaus(sets, { unit: "lb", now: NOW });
  assert.equal(p.length, 1);
  assert.equal(p[0].exerciseId, "bench");
  assert.equal(p[0].stalled, 3);
  assert.equal(p[0].fix.title, "Change the rep range");

  // A big drop means fatigue
  const tired = [...sets.filter((s) => s.exercise_id === "bench"), set("6", "bench", 90, 5, w(6))];
  assert.equal(findPlateaus(tired, { unit: "lb", now: NOW })[0].fix.title, "Take a lighter week");
  // Old lifts you stopped doing aren't flagged
  assert.equal(findPlateaus(sets, { unit: "lb", now: NOW + 60 * DAY }).length, 0);
});

test("streak stats: current, longest, on target, active days", () => {
  const s = [
    // three weeks in a row long ago
    sess("a", at(2026, 7, 3)), sess("b", at(2026, 7, 10)), sess("c", at(2026, 7, 17)),
    // last week twice, this week once
    sess("d", at(2026, 9, 6)), sess("e", at(2026, 9, 8)), sess("f", at(2026, 9, 13)),
  ];
  const st = streakStats(s, 2, NOW);
  assert.equal(st.current, 2);
  assert.equal(st.longest, 3);
  assert.equal(st.onTarget, 1, "this week (1 so far) is still in progress");
  assert.equal(st.activeDays30, 3);
  assert.equal(streakStats(s, null, NOW).onTarget, null);
});

test("consistency grid: Monday-first weeks graded by volume", () => {
  const g = consistencyGrid([sess("a", at(2026, 9, 12), 500), sess("b", at(2026, 9, 13), 5000)], 4, NOW);
  assert.equal(g.length, 4);
  assert.equal(new Date(g[3][0].date).getDay(), 1);
  const mon = g[3][0];
  const tue = g[3][1];
  assert.equal(mon.workouts, 1);
  assert.ok(tue.level > mon.level);
  assert.equal(g[3][6].future, true);
  assert.equal(g[0][0].level, 0);
});

test("month consistency against a weekly target", () => {
  const m = monthConsistency([sess("a", at(2026, 9, 2)), sess("b", at(2026, 9, 9)), sess("c", at(2026, 8, 9))], 3, 2, NOW);
  assert.equal(m[0].month, 9);
  assert.equal(m[0].workouts, 2);
  assert.equal(m[0].planned, 6); // 14 days so far x 3/week
  assert.equal(m[1].workouts, 1);
  assert.equal(m[1].planned, 13);
  assert.equal(monthConsistency([], null, 1, NOW)[0].pct, null);
});

test("strain: heart rate zones, RPE and the 0-100 score", () => {
  assert.equal(maxHrFor({ birth_year: 2000 }, NOW), 194);
  assert.equal(maxHrFor({ max_hr: 201 }), 201);
  assert.equal(maxHrFor(null), 190);

  // 10 minutes at 140 bpm (74% of 190 = zone 3), samples every minute
  const samples = Array.from({ length: 11 }, (_, i) => ({ t: i * 60_000, bpm: 140 }));
  const c = cardioLoad(10, samples, null, 190);
  assert.equal(c.source, "watch");
  assert.ok(Math.abs(c.zones[2] - 10.08) < 0.01);
  assert.ok(Math.abs(c.load - 30.25) < 0.01);
  // Gaps count at most 2 minutes
  assert.ok(cardioLoad(60, [{ t: 0, bpm: 140 }, { t: 3600_000, bpm: 140 }], null, 190).load < 7);
  assert.equal(cardioLoad(60, [], 120, 190).load, 120);
  assert.equal(cardioLoad(60, [], null, 190).source, "time");

  const m = muscularLoad([
    { set_type: "warmup", reps: 5, rpe: null },
    { set_type: "normal", reps: 5, rpe: 9 },
    { set_type: "normal", reps: 5, rpe: null },
  ]);
  assert.equal(m.sets, 2);
  assert.equal(m.load, 1.75);
  assert.equal(m.avgRpe, 9);
  assert.equal(muscularLoad([{ set_type: "normal", reps: 5, rpe: null }]).avgRpe, null);

  assert.equal(strainScore(0, 0), 0);
  const typical = strainScore(120, 15);
  assert.ok(typical >= 55 && typical <= 65, String(typical));
  assert.ok(strainScore(500, 60) < 100);
  assert.equal(strainBand(typical).label, "Moderate");
  assert.equal(strainBand(90).label, "All-out");

  const days = dailyStrain([
    { start: at(2026, 9, 14, 7), cardio: 60, muscular: 8 },
    { start: at(2026, 9, 14, 18), cardio: 60, muscular: 7 },
  ]);
  const d = [...days.values()][0];
  assert.equal(d.workouts, 2);
  assert.equal(d.score, strainScore(120, 15));
});

test("workoutStrain puts heart rate and sets together", () => {
  const start = new Date(NOW).toISOString();
  const end = new Date(NOW + 3600_000).toISOString();
  const sets = Array.from({ length: 20 }, () => ({ set_type: "normal", reps: 8, rpe: null }));
  const noHr = workoutStrain({ start_time: start, end_time: end }, [], sets, 190);
  assert.equal(noHr.cardio.source, "time");
  assert.equal(noHr.minutes, 60);
  const withHr = workoutStrain({ start_time: start, end_time: end, avg_hr: 140 }, [], sets, 190);
  assert.ok(withHr.score > noHr.score);
});

test("best sets: e1RM, heaviest, most reps, volume and rep maxes", () => {
  const days = [
    { sessionId: "a", date: "2026-10-01", sets: [{ set_type: "warmup", weight: 150, reps: 1 }, { set_type: "normal", weight: 100, reps: 5 }, { set_type: "normal", weight: 100, reps: 8 }] },
    { sessionId: "b", date: "2026-10-08", sets: [{ set_type: "normal", weight: 120, reps: 1 }, { set_type: "normal", weight: 60, reps: 15 }] },
  ];
  const b = bestSets(days);
  assert.equal(b.e1rm?.weight, 100);
  assert.equal(b.e1rm?.reps, 8);
  assert.equal(b.heaviest?.weight, 120, "warm-ups don't count");
  assert.equal(b.mostReps?.reps, 15);
  assert.equal(b.volume?.value, 1300);
  assert.deepEqual(b.repMaxes.map((r) => [r.reps, r.weight]), [[1, 120], [3, 100], [5, 100], [8, 100], [10, 60], [12, 60]]);
  assert.equal(daysToStatSets(days, "x").length, 5);
  assert.equal(bestSets([]).e1rm, null);
});
