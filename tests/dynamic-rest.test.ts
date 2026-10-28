import { test } from "node:test";
import assert from "node:assert/strict";
import { isCompoundExercise, extractTargetReps, recommendRestTime } from "../src/lib/dynamic-rest.ts";

test("isCompoundExercise detects compound movements accurately", () => {
  assert.equal(isCompoundExercise("Barbell Back Squat"), true);
  assert.equal(isCompoundExercise("Incline Dumbbell Bench Press"), true);
  assert.equal(isCompoundExercise("Conventional Deadlift"), true);
  assert.equal(isCompoundExercise("Standing Overhead Press"), true);
  assert.equal(isCompoundExercise("Barbell Bent Over Row"), true);

  assert.equal(isCompoundExercise("Standing Cable Bicep Curl"), false);
  assert.equal(isCompoundExercise("Lateral Raise"), false);
  assert.equal(isCompoundExercise("Leg Extension"), false);
});

test("extractTargetReps parses numeric bounds from rep target strings", () => {
  assert.equal(extractTargetReps("5"), 5);
  assert.equal(extractTargetReps("8-12"), 8);
  assert.equal(extractTargetReps("5x5"), 5);
  assert.equal(extractTargetReps(10), 10);
  assert.equal(extractTargetReps(null), null);
});

test("recommendRestTime assigns max strength rest to heavy compounds and pump rest to isolation", () => {
  // Heavy compound squat
  const heavySquat = recommendRestTime({
    exerciseName: "Barbell Back Squat",
    repTarget: "5",
  });
  assert.equal(heavySquat.seconds, 180);
  assert.equal(heavySquat.category, "Max Strength");

  // Heavy squat with high RPE
  const highRpeSquat = recommendRestTime({
    exerciseName: "Barbell Back Squat",
    repTarget: "3",
    rpe: 9.5,
  });
  assert.equal(highRpeSquat.seconds, 210);

  // Moderate compound bench
  const modBench = recommendRestTime({
    exerciseName: "Barbell Bench Press",
    repTarget: "8",
  });
  assert.equal(modBench.seconds, 120);
  assert.equal(modBench.category, "Hypertrophy");

  // High rep isolation
  const cableFlyes = recommendRestTime({
    exerciseName: "Cable Flyes",
    repTarget: "15",
  });
  assert.equal(cableFlyes.seconds, 60);
  assert.equal(cableFlyes.category, "Isolation Pump");

  // Warmup set
  const warmup = recommendRestTime({
    isWarmup: true,
  });
  assert.equal(warmup.seconds, 60);
});
