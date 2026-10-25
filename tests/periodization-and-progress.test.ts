import test from "node:test";
import assert from "node:assert/strict";
import {
  PHASES,
  getPhaseForWeek,
  calculatePeriodizedTarget,
  calculateDoubleProgression,
  classifyExerciseBiomechanics,
} from "../src/lib/periodization.ts";
import {
  classifyMovementPattern,
  calculatePatternStrength,
  calculateMovementBalance,
  calculateStimulusVolume,
  calculateSixWeekOverview,
} from "../src/lib/progress-index-advanced.ts";
import type { StatSet, StatSession } from "../src/lib/stats.ts";

test("Periodization Engine: Mesocycle phases and volume wave progression", () => {
  // 6-week mesocycle
  assert.equal(getPhaseForWeek(1, 6).phase, "accumulation");
  assert.equal(getPhaseForWeek(2, 6).phase, "accumulation");
  assert.equal(getPhaseForWeek(3, 6).phase, "intensification");
  assert.equal(getPhaseForWeek(4, 6).phase, "intensification");
  assert.equal(getPhaseForWeek(5, 6).phase, "peak");
  assert.equal(getPhaseForWeek(6, 6).phase, "deload");

  // Deload cuts volume in half (volumeMultiplier = 0.5)
  assert.equal(PHASES.deload.volumeMultiplier, 0.5);
  // Accumulation adds reps (+2) with submaximal load (0.95)
  assert.equal(PHASES.accumulation.repAdjustment, 2);
  assert.equal(PHASES.accumulation.loadMultiplier, 0.95);
  // Intensification raises load (+2.5%)
  assert.equal(PHASES.intensification.loadMultiplier, 1.025);
  // Peak stimulus tests near max (+5% load, -2 reps)
  assert.equal(PHASES.peak.loadMultiplier, 1.05);
  assert.equal(PHASES.peak.repAdjustment, -2);
});

test("Periodization Engine: calculatePeriodizedTarget on compound & custom exercises", () => {
  // Bench press (compound upper)
  const benchTarget = {
    exerciseId: "bench-1",
    exerciseName: "Barbell Bench Press",
    primary_muscle: "chest",
    target_sets: 4,
    target_reps: 8,
    target_reps_max: 10,
    target_weight_kg: 100,
  };

  // Week 1: Accumulation (+2 reps, 95% weight)
  const acc = calculatePeriodizedTarget(benchTarget, 1, 6, "metric");
  assert.equal(acc.periodizedSets, 4);
  assert.equal(acc.periodizedReps, 10);
  assert.equal(acc.periodizedRepsMax, 12);
  assert.equal(acc.periodizedWeightKg, 95); // 100 * 0.95

  // Week 5: Peak Stimulus (-2 reps, 105% weight)
  const peak = calculatePeriodizedTarget(benchTarget, 5, 6, "metric");
  assert.equal(peak.periodizedReps, 6);
  assert.equal(peak.periodizedRepsMax, 8);
  assert.equal(peak.periodizedWeightKg, 105);

  // Week 6: Deload (half sets, -10% weight)
  const deload = calculatePeriodizedTarget(benchTarget, 6, 6, "metric");
  assert.equal(deload.periodizedSets, 2);
  assert.equal(deload.periodizedWeightKg, 90);
});

test("Periodization Engine: classifyExerciseBiomechanics categorizes custom exercises", () => {
  // Custom user exercises
  const customLegPress = classifyExerciseBiomechanics({ name: "Single Leg Hack Machine", primary_muscle: "quads" });
  assert.equal(customLegPress.isCompound, true);
  assert.equal(customLegPress.isLowerBody, true);

  const customCurl = classifyExerciseBiomechanics({ name: "Incline Spider Dumbbell Curl", primary_muscle: "biceps" });
  assert.equal(customCurl.isCompound, false);
  assert.equal(customCurl.isLowerBody, false);

  const customDeadlift = classifyExerciseBiomechanics({ name: "Deficit Trap Bar Pull", primary_muscle: "hamstrings" });
  assert.equal(customDeadlift.isCompound, true);
  assert.equal(customDeadlift.isLowerBody, true);
});

test("Double-Progression: strict vs customizable increment overload", () => {
  const target = {
    exerciseName: "Barbell Overhead Press",
    isCompound: true,
    isLowerBody: false,
    target_sets: 3,
    target_reps: 8,
    target_reps_max: 10,
    target_weight_kg: 60,
  };

  // 1. All sets hit top of bracket (10 reps) -> increase weight
  const successfulSets = [
    { weight: 60, reps: 10 },
    { weight: 60, reps: 10 },
    { weight: 60, reps: 10 },
  ];
  const resSuccess = calculateDoubleProgression(target, successfulSets, "imperial");
  assert.equal(resSuccess.action, "increase_weight");
  assert.equal(resSuccess.recommendedReps, 8); // resets to floor

  // 2. Custom increments: upper compound +5 lb, isolation +2.5 lb
  const customSettings = {
    upperCompoundIncLb: 5,
    isolationIncLb: 2.5,
    progressionTrigger: "all_sets_top" as const,
  };
  const resCustom = calculateDoubleProgression(target, successfulSets, "imperial", customSettings);
  assert.equal(resCustom.action, "increase_weight");

  // 3. In-bracket progress: 10, 9, 8 -> keep weight, add reps
  const mixedSets = [
    { weight: 60, reps: 10 },
    { weight: 60, reps: 9 },
    { weight: 60, reps: 8 },
  ];
  const resMixed = calculateDoubleProgression(target, mixedSets, "imperial");
  assert.equal(resMixed.action, "add_reps");

  // 4. Miss by >= 3 reps -> auto-deload safeguard
  const missSets = [
    { weight: 60, reps: 5 }, // 8 - 5 = 3 reps short
    { weight: 60, reps: 4 },
  ];
  const resMiss = calculateDoubleProgression(target, missSets, "imperial", { autoDeloadOnMiss: true, deloadPercent: 10 });
  assert.equal(resMiss.action, "deload");
  assert.ok(resMiss.recommendedWeightKg! < 60);
});

test("Progress Index Advanced: Movement pattern classification", () => {
  assert.equal(classifyMovementPattern({ name: "Barbell Overhead Press", primary_muscle: "front_delts" }), "V.Push");
  assert.equal(classifyMovementPattern({ name: "Weighted Pull-Up", primary_muscle: "lats" }), "V.Pull");
  assert.equal(classifyMovementPattern({ name: "Incline Dumbbell Bench", primary_muscle: "chest" }), "H.Push");
  assert.equal(classifyMovementPattern({ name: "Chest Supported T-Bar Row", primary_muscle: "upper_back" }), "H.Pull");
  assert.equal(classifyMovementPattern({ name: "Barbell Back Squat", primary_muscle: "quads" }), "Squat");
  assert.equal(classifyMovementPattern({ name: "Romanian Deadlift", primary_muscle: "hamstrings" }), "Hinge");
});

test("Progress Index Advanced: Hexagonal movement balance & ratios", () => {
  const sets: StatSet[] = [];
  const exerciseMap = new Map([
    ["e1", { name: "Bench Press", primary_muscle: "chest" }],
    ["e2", { name: "Barbell Row", primary_muscle: "upper_back" }],
    ["e3", { name: "Squat", primary_muscle: "quads" }],
    ["e4", { name: "RDL", primary_muscle: "hamstrings" }],
  ]);

  const now = Date.now();
  // Add 10 sets of bench, 10 sets of row
  for (let i = 0; i < 10; i++) {
    sets.push({ session_id: "s1", set_type: "working", exercise_id: "e1", weight: 80, reps: 8, completed_at: new Date(now - 86400000).toISOString() });
    sets.push({ session_id: "s1", set_type: "working", exercise_id: "e2", weight: 70, reps: 8, completed_at: new Date(now - 86400000).toISOString() });
  }

  const balance = calculateMovementBalance(sets, exerciseMap, now);
  assert.ok(balance.ratios.hPushToPull > 0);
  assert.equal(balance.radarPoints.length, 6); // 6 vertices of hexagon
});

test("Progress Index Advanced: 6-Week Overview & Target Band", () => {
  const sets: StatSet[] = [];
  const sessions: StatSession[] = [];
  const now = Date.now();

  const overview = calculateSixWeekOverview(sets, sessions, now);
  assert.equal(overview.weeks.length, 6);
  assert.equal(overview.targetBand.min, 98);
  assert.equal(overview.targetBand.max, 106);
  // Without recent sessions, properly alerts status
  assert.ok(overview.currentStatus.includes("Week Closed Empty"));
});
