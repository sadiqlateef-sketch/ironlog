import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePlates } from "../src/lib/plates.ts";
import {
  formatClock,
  nextSetType,
  parseNumber,
  shouldStartRest,
  workingSetNumbers,
} from "../src/lib/workout-logic.ts";

test("plates: 225 lb on a 45 lb bar is two 45s per side", () => {
  assert.deepEqual(calculatePlates(225, 45, [45, 35, 25, 10, 5, 2.5]), { perSide: [45, 45], achieved: 225, remainder: 0 });
});

test("plates: 185 lb mixes plates", () => {
  assert.deepEqual(calculatePlates(185, 45, [45, 35, 25, 10, 5, 2.5]).perSide, [45, 25]);
});

test("plates: 102.5 kg metric", () => {
  assert.deepEqual(calculatePlates(102.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide, [25, 15, 1.25]);
});

test("plates: unreachable target reports remainder", () => {
  const r = calculatePlates(137, 45, [45, 35, 25, 10, 5, 2.5]);
  assert.equal(r.achieved, 135);
  assert.equal(r.remainder, 2);
});

test("plates: target at or below bar needs no plates", () => {
  assert.deepEqual(calculatePlates(45, 45, [45]).perSide, []);
});

test("set type cycles", () => {
  assert.equal(nextSetType("normal"), "warmup");
  assert.equal(nextSetType("failure"), "normal");
});

test("working set numbers skip warm-ups", () => {
  assert.deepEqual(workingSetNumbers(["warmup", "warmup", "normal", "normal", "drop"]), [0, 0, 1, 2, 2]);
});

test("parseNumber", () => {
  assert.equal(parseNumber("102,5"), 102.5);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

test("supersets rest only after the last exercise in the group", () => {
  const ex = [
    { order: 1, supersetGroup: 1 },
    { order: 2, supersetGroup: 1 },
    { order: 3, supersetGroup: null },
  ];
  assert.equal(shouldStartRest(1, 1, ex), false);
  assert.equal(shouldStartRest(2, 1, ex), true);
  assert.equal(shouldStartRest(3, null, ex), true);
});

test("clock format", () => {
  assert.equal(formatClock(125), "2:05");
  assert.equal(formatClock(-3), "0:00");
});

import { bestE1rm, focusAfterLog, nextUnfinished, segmentStates, similarExercises, splitNumbers } from "../src/lib/workout-logic.ts";

const S = (done: boolean) => ({ done });

test("segments: current, done and to-do", () => {
  const blocks = [
    { order: 1, sets: [S(true), S(true)] },
    { order: 2, sets: [S(true), S(false)] },
    { order: 3, sets: [S(false)] },
  ];
  assert.deepEqual(segmentStates(blocks, 2), ["done", "current", "todo"]);
});

test("focus: superset alternates A -> B -> A", () => {
  const blocks = [
    { order: 1, supersetGroup: 1, sets: [S(true), S(false)] },
    { order: 2, supersetGroup: 1, sets: [S(false), S(false)] },
    { order: 3, supersetGroup: null, sets: [S(false)] },
  ];
  assert.equal(focusAfterLog(1, blocks), 2);
  assert.equal(focusAfterLog(2, blocks), 1);
  assert.equal(focusAfterLog(3, blocks), 3);
});

test("focus: superset partner finished, stay on this one", () => {
  const blocks = [
    { order: 1, supersetGroup: 1, sets: [S(true), S(false)] },
    { order: 2, supersetGroup: 1, sets: [S(true)] },
  ];
  assert.equal(focusAfterLog(1, blocks), 1);
});

test("next unfinished wraps round and skips finished", () => {
  const blocks = [
    { order: 1, sets: [S(false)] },
    { order: 2, sets: [S(true)] },
    { order: 3, sets: [S(true)] },
  ];
  assert.equal(nextUnfinished(2, blocks), 1);
  assert.equal(nextUnfinished(1, [{ order: 1, sets: [S(true)] }]), null);
});

test("swap: same main muscle, same movement type first", () => {
  const ex = (id: string, name: string, primary: string, mechanic: string, secondary: string[] = []) => ({
    id, name, primary_muscle: primary, secondary_muscles: secondary, equipment: "barbell", mechanic,
  });
  const bench = ex("1", "Bench Press", "chest", "compound", ["triceps", "front_delts"]);
  const list = [bench, ex("2", "Cable Fly", "chest", "isolation"), ex("3", "Dumbbell Bench", "chest", "compound", ["triceps"]), ex("4", "Squat", "quads", "compound")];
  assert.deepEqual(similarExercises(bench, list).map((e) => e.id), ["3", "2"]);
  // Staples on everyday equipment beat odd variants
  const odd = { ...ex("5", "Around The Worlds", "chest", "compound", ["triceps"]), equipment: "band" };
  const staple = { ...ex("6", "Push-Up", "chest", "compound"), equipment: "bodyweight", aliases: ["Press-Up"] };
  assert.deepEqual(similarExercises(bench, [odd, staple]).map((e) => e.id), ["6", "5"]);
});

test("best e1RM uses Epley and ignores empty sets", () => {
  assert.equal(Math.round(bestE1rm([{ weight: 140, reps: 5 }, { weight: 90, reps: 12 }, { weight: 0, reps: 5 }])), 163);
  assert.equal(bestE1rm([]), 0);
});

test("splitNumbers highlights weights, sets and ranges", () => {
  const parts = splitNumbers("Best set was 140 lb × 5 reps, top of your 6–8 range.");
  assert.deepEqual(parts.filter((_, i) => i % 2 === 1), ["140 lb × 5 reps", "6–8"]);
  assert.equal(parts.join(""), "Best set was 140 lb × 5 reps, top of your 6–8 range.");
});

import { intervalPhase } from "../src/lib/workout-logic.ts";

test("intervals: 40 on / 20 off, no rest after the last round", () => {
  assert.deepEqual(intervalPhase(0, 40, 20, 3), { phase: "work", round: 1, left: 40 });
  assert.deepEqual(intervalPhase(45, 40, 20, 3), { phase: "rest", round: 1, left: 15 });
  assert.deepEqual(intervalPhase(60, 40, 20, 3), { phase: "work", round: 2, left: 40 });
  assert.equal(intervalPhase(160, 40, 20, 3).phase, "done");
});

import { chartPoints, groupHistory, instructionSteps, muscleShare } from "../src/lib/workout-logic.ts";

const hs = (session_id: string, set_number: number, weight: number, reps: number, at: string, set_type = "normal") => ({
  session_id, set_number, set_type, weight, reps, completed_at: at,
});

test("history: grouped newest first with best set and median rest", () => {
  const days = groupHistory(
    [
      hs("a", 1, 60, 10, "2026-10-01T10:00:00Z", "warmup"),
      hs("a", 2, 100, 5, "2026-10-01T10:02:00Z"),
      hs("a", 3, 100, 6, "2026-10-01T10:05:00Z"),
      hs("b", 1, 105, 5, "2026-10-08T10:00:00Z"),
    ],
    [
      { id: "a", start_time: "2026-10-01T09:50:00Z", name: "Push" },
      { id: "b", start_time: "2026-10-08T09:50:00Z", name: null },
      { id: "c", start_time: "2026-10-09T09:50:00Z", name: "Legs" },
    ],
  );
  assert.deepEqual(days.map((d) => d.sessionId), ["b", "a"]);
  assert.equal(days[1].best, 2); // 100 × 6 beats 100 × 5; warm-up ignored
  assert.equal(days[1].restSeconds, 180); // gaps 120s and 180s -> median index 1
  assert.equal(days[1].volume, 1100);
  assert.equal(days[0].restSeconds, null);
});

test("chart: range filter and min/max", () => {
  const days = groupHistory(
    [hs("a", 1, 100, 1, "2026-01-01T10:00:00Z"), hs("b", 1, 120, 1, "2026-10-10T10:00:00Z")],
    [
      { id: "a", start_time: "2026-01-01T10:00:00Z", name: null },
      { id: "b", start_time: "2026-10-10T10:00:00Z", name: null },
    ],
  );
  const now = Date.parse("2026-10-14T00:00:00Z");
  assert.deepEqual(chartPoints(days, "e1rm", 14, now).points.map((p) => p.value), [120]);
  const all = chartPoints(days, "e1rm", null, now);
  assert.deepEqual([all.min?.value, all.max?.value], [100, 120]);
  assert.equal(all.max?.date, "2026-10-10T10:00:00Z");
  assert.equal(all.points[0].value, 100); // oldest first
});

test("muscle share adds to 100", () => {
  assert.deepEqual(muscleShare("chest", []), [{ muscle: "chest", pct: 100 }]);
  const s = muscleShare("chest", ["triceps", "front_delts", "chest"]);
  assert.deepEqual(s, [{ muscle: "chest", pct: 60 }, { muscle: "triceps", pct: 20 }, { muscle: "front_delts", pct: 20 }]);
  assert.equal(muscleShare("quads", ["glutes", "hamstrings", "calves"]).reduce((a, b) => a + b.pct, 0), 100);
});

test("instruction steps split on sentences", () => {
  assert.deepEqual(instructionSteps("Lie back. Grip at 1.5x shoulder width. Press up!"), [
    "Lie back.", "Grip at 1.5x shoulder width.", "Press up!",
  ]);
  assert.deepEqual(instructionSteps(null), []);
});
