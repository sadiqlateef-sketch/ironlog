import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateSleepScore,
  calculateCardioScore,
  calculateMuscleScore,
  computeReadinessReport,
} from "../src/lib/readiness.ts";
import type { MuscleRecovery } from "../src/lib/recovery.ts";

test("calculateSleepScore handles varied durations and qualities", () => {
  // 8.0 hours should be optimal 100
  assert.equal(calculateSleepScore(8.0), 100);

  // 7.2 hours should be 90
  assert.equal(calculateSleepScore(7.2), 90);

  // 6.5 hours should be 75
  assert.equal(calculateSleepScore(6.5), 75);

  // 5.5 hours should be 55
  assert.equal(calculateSleepScore(5.5), 55);

  // 4.0 hours should be low
  assert.equal(calculateSleepScore(4.0), 40);

  // Quality blending
  const blended = calculateSleepScore(8.0, 50); // 100 * 0.7 + 50 * 0.3 = 70 + 15 = 85
  assert.equal(blended, 85);

  // Null fallback
  assert.equal(calculateSleepScore(null, null), 80);
});

test("calculateCardioScore evaluates resting HR against baseline", () => {
  // At or below baseline is 100
  assert.equal(calculateCardioScore(58, 60), 100);
  assert.equal(calculateCardioScore(60, 60), 100);

  // Mildly elevated (+2) is 92
  assert.equal(calculateCardioScore(62, 60), 92);

  // Elevated (+5) is 80
  assert.equal(calculateCardioScore(65, 60), 80);

  // High strain (+10) is 45
  assert.equal(calculateCardioScore(70, 60), 45);

  // Missing values fallback
  assert.equal(calculateCardioScore(null, null), 85);
});

test("calculateMuscleScore computes weighted score and detects most fatigued muscle", () => {
  const dummyRecovery: MuscleRecovery[] = [
    { muscle: "chest", recovery: 40, fatigue: 6, sets: 8, hoursToReady: 18 },
    { muscle: "triceps", recovery: 60, fatigue: 4, sets: 4, hoursToReady: 8 },
    { muscle: "quads", recovery: 100, fatigue: 0, sets: 0, hoursToReady: 0 },
  ];

  const res = calculateMuscleScore(dummyRecovery);
  assert.equal(res.mostFatigued?.name, "Chest");
  assert.equal(res.mostFatigued?.recovery, 40);
  // Average of worked (40 + 60) / 2 = 50. Weighted: 50 * 0.6 + 40 * 0.4 = 30 + 16 = 46
  assert.equal(res.score, 46);

  // Fresh lifter (no sets)
  assert.equal(calculateMuscleScore([]).score, 100);
});

test("computeReadinessReport categorizes readiness tiers and gives recommendations", () => {
  // Optimal
  const optimal = computeReadinessReport(100, {
    sleepHours: 8.5,
    sleepQuality: 95,
    restingHr: 56,
    baselineRestingHr: 60,
  });
  assert.equal(optimal.level, "optimal");
  assert.ok(optimal.score >= 85);
  assert.ok(optimal.targetVolumeScale >= 1.0);

  // Moderate
  const moderate = computeReadinessReport(60, {
    sleepHours: 6.2,
    sleepQuality: 70,
    restingHr: 66,
    baselineRestingHr: 60,
  });
  assert.equal(moderate.level, "moderate");
  assert.ok(moderate.score >= 50 && moderate.score < 70);

  // Fatigued
  const fatigued = computeReadinessReport(25, {
    sleepHours: 4.5,
    sleepQuality: 40,
    restingHr: 75,
    baselineRestingHr: 60,
  });
  assert.equal(fatigued.level, "fatigued");
  assert.ok(fatigued.score < 50);
  assert.ok(fatigued.targetVolumeScale < 0.8);
});
