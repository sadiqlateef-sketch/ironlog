import { test } from "node:test";
import assert from "node:assert/strict";
import { buildWatchTile, buildWatchComplication } from "../../src/lib/watch-tile-payload.ts";

test("watch tile payload formats lifting state correctly", () => {
  const tile = buildWatchTile({
    workoutName: "Push Day",
    exerciseName: "Incline Bench Press",
    exerciseSlug: "incline-bench-press",
    currentSetIndex: 2,
    totalSets: 4,
    targetWeight: 185,
    targetReps: 8,
    unit: "lb",
    isRestActive: false,
  });

  assert.equal(tile.workoutName, "Push Day");
  assert.equal(tile.exerciseName, "Incline Bench Press");
  assert.equal(tile.setIndexText, "Set 2 of 4");
  assert.equal(tile.targetWeightText, "185 lb");
  assert.equal(tile.targetRepsText, "8 reps");
  assert.equal(tile.isRestActive, false);
  assert.equal(tile.canLogCurrentSet, true);
});

test("watch tile payload formats rest countdown correctly", () => {
  const tile = buildWatchTile({
    workoutName: "Push Day",
    exerciseName: "Incline Bench Press",
    exerciseSlug: "incline-bench-press",
    currentSetIndex: 2,
    totalSets: 4,
    targetWeight: 185,
    targetReps: 8,
    isRestActive: true,
    restRemaining: 45,
    totalRest: 90,
  });

  assert.equal(tile.isRestActive, true);
  assert.equal(tile.restSecondsRemaining, 45);
  assert.equal(tile.totalRestSeconds, 90);
  assert.equal(tile.restPercent, 50);
  assert.equal(tile.canLogCurrentSet, false);
});

test("watch complication builds ranged value during active rest", () => {
  const comp = buildWatchComplication(true, 30, 90, "Bench");
  assert.equal(comp.complicationType, "RANGED_VALUE");
  assert.equal(comp.title, "REST");
  assert.equal(comp.shortText, "30s");
  assert.equal(comp.progressPercent, 67); // (90 - 30) / 90 * 100 = 66.6% -> 67%
  assert.equal(comp.iconName, "timer");
});

test("watch complication builds short text during lifting", () => {
  const comp = buildWatchComplication(false, 0, 0, "Squat");
  assert.equal(comp.complicationType, "SHORT_TEXT");
  assert.equal(comp.title, "LIFT");
  assert.equal(comp.shortText, "SQUAT");
  assert.equal(comp.iconName, "dumbbell");
});
