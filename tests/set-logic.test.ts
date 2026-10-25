import { test } from "node:test";
import assert from "node:assert/strict";
import { effortBadge, effortChoices, effortLabel, matchPrevious, platesText, sideReps, suggestWeight, warmupRamp, warmupWeightsKg, weightStep } from "../src/lib/set-logic.ts";

const LB = { plateLoaded: true, bar: 45, plates: [45, 35, 25, 10, 5, 2.5], step: 5 };

test("effort: reps left is stored as RPE and shown back the same way", () => {
  assert.deepEqual(effortChoices("rir").map((c) => [c.label, c.rpe]), [["0", 10], ["1", 9], ["2", 8], ["3", 7], ["4+", 6]]);
  assert.deepEqual(effortChoices("rpe").map((c) => c.rpe), [6, 7, 8, 9, 10]);
  assert.equal(effortLabel(8, "rir"), "2 left");
  assert.equal(effortLabel(5, "rir"), "4+ left");
  assert.equal(effortLabel(8.5, "rpe"), "RPE 8.5");
  assert.equal(effortBadge(10, "rir"), "0");
  assert.equal(effortBadge(9, "rpe"), "9");
  assert.equal(effortBadge(null, "rir"), null);
});

test("warm-ups: 225 lb bench ramps bar, 90, 135, 180 with plates", () => {
  const r = warmupRamp(225, LB);
  assert.deepEqual(r.map((w) => [w.weight, w.reps]), [[45, 10], [90, 5], [135, 3], [180, 2]]);
  assert.deepEqual(r[2].plates, [45]);
  assert.equal(platesText(r[0].plates!), "Bar");
  assert.equal(platesText(r[3].plates!), "45 + 10 + 10 + 2.5");
  // Every warm-up is lighter than the work and climbs.
  for (let i = 1; i < r.length; i++) assert.ok(r[i].weight > r[i - 1].weight && r[i].weight < 225);
});

test("warm-ups: light work skips steps that land on the bar; the bar itself needs none", () => {
  assert.deepEqual(warmupRamp(95, LB).map((w) => w.weight), [45, 55, 75]);
  assert.deepEqual(warmupRamp(45, LB), []);
  assert.deepEqual(warmupRamp(0, LB), []);
});

test("warm-ups: dumbbells round to the step and have no plates", () => {
  const r = warmupRamp(60, { plateLoaded: false, bar: 45, plates: [], step: 5 });
  assert.deepEqual(r, [{ weight: 30, reps: 8, plates: null }, { weight: 45, reps: 3, plates: null }]);
});

test("suggest: easy sets (3+ left) or the top of the plan's range move the weight up", () => {
  const easy = [8, 8, 8].map((reps) => ({ set_type: "normal" as const, weight: 185, reps, rpe: 7 }));
  assert.deepEqual(suggestWeight(easy, { repMax: null, step: 5 }), { weight: 190, from: 185, why: "Last time felt easy (3+ reps left)" });
  const top = [10, 10, 10].map((reps) => ({ set_type: "normal" as const, weight: 185, reps, rpe: null }));
  assert.equal(suggestWeight(top, { repMax: 10, step: 5 })?.weight, 190);
});

test("suggest: hard, unrated or all-out sets keep last time's weight", () => {
  const hard = [8, 8, 8].map((reps) => ({ set_type: "normal" as const, weight: 185, reps, rpe: 9 }));
  assert.equal(suggestWeight(hard, { repMax: null, step: 5 }), null);
  const unrated = [8, 8, 8].map((reps) => ({ set_type: "normal" as const, weight: 185, reps, rpe: null }));
  assert.equal(suggestWeight(unrated, { repMax: null, step: 5 }), null);
  const allOut = [10, 10, 10].map((reps, i) => ({ set_type: "normal" as const, weight: 185, reps, rpe: i === 2 ? 10 : 8 }));
  assert.equal(suggestWeight(allOut, { repMax: 10, step: 5 }), null);
  // Warm-ups don't count, and only sets at the top weight are judged.
  const mixed = [
    { set_type: "warmup" as const, weight: 95, reps: 5, rpe: null },
    { set_type: "normal" as const, weight: 175, reps: 8, rpe: 9 },
    { set_type: "normal" as const, weight: 185, reps: 8, rpe: 6 },
  ];
  assert.equal(suggestWeight(mixed, { repMax: null, step: 5 })?.weight, 190);
  assert.equal(suggestWeight([], { repMax: 10, step: 5 }), null);
});

test("steps and sides", () => {
  assert.equal(weightStep("imperial", true), 10);
  assert.equal(weightStep("metric", false), 2.5);
  assert.deepEqual(sideReps(10, 8), { reps_left: 10, reps_right: 8, reps: 8 });
  assert.deepEqual(sideReps(null, 9), { reps_left: 9, reps_right: 9, reps: 9 });
  assert.equal(sideReps(null, null), null);
});

test("last time lines up warm-ups with warm-ups and work with work", () => {
  const prev = [{ set_type: "normal" as const, id: "a" }, { set_type: "normal" as const, id: "b" }];
  const m = matchPrevious(["warmup", "warmup", "normal", "normal", "normal"], prev);
  assert.deepEqual(m.map((p) => p?.id), [undefined, undefined, "a", "b", undefined]);
});

test("planned warm-up rows are prefilled from the working weight", () => {
  assert.deepEqual(warmupWeightsKg(100, 2), [70, 85]);
  assert.deepEqual(warmupWeightsKg(100, 3), [50, 70, 85]);
  assert.deepEqual(warmupWeightsKg(0, 2), [0, 0]);
});
