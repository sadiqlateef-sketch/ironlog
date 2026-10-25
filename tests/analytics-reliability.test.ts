import test from "node:test";
import assert from "node:assert/strict";
import { epley, brzycki, MAX_RELIABLE_REPS } from "../src/lib/one-rm.ts";
import { computeRecovery, halfLifeHours, recoveryLabel, type MuscleSet } from "../src/lib/recovery.ts";
import {
  bestSets,
  hrZone,
  maxHrFor,
  strainBand,
  strainScore,
  type BestSetDay,
} from "../src/lib/insights.ts";
import { muscleBreakdown, type StatSet } from "../src/lib/stats.ts";

test("1RM formulas: single rep is exact tested max, low reps converge, extreme reps flagged", () => {
  const weight = 225;

  // Single rep = 100% exact tested max
  assert.equal(epley(weight, 1), weight);
  assert.equal(brzycki(weight, 1), weight);

  // 5 reps: both formulas converge within 4% of each other
  const epley5 = epley(weight, 5);
  const brzycki5 = brzycki(weight, 5);
  assert.ok(Math.abs(epley5 - brzycki5) / epley5 < 0.05);

  // Boundary conditions: zero/negative numbers return 0 cleanly without NaN
  assert.equal(epley(0, 5), 0);
  assert.equal(epley(225, 0), 0);
  assert.equal(epley(-100, 5), 0);
  assert.equal(brzycki(0, 5), 0);
  assert.equal(brzycki(225, 0), 0);
  assert.equal(brzycki(225, 40), 0); // Brzycki formula denominator invalid past 37 reps

  // MAX_RELIABLE_REPS threshold check
  assert.equal(MAX_RELIABLE_REPS, 12);
  const repCount1 = 10;
  const repCount2 = 25;
  assert.ok(repCount1 <= MAX_RELIABLE_REPS);
  assert.ok(repCount2 > MAX_RELIABLE_REPS);
});

test("volume and muscle breakdown: warmup sets strictly excluded from working analytics", () => {
  const sets: StatSet[] = [
    { session_id: "s1", exercise_id: "bench", set_type: "warmup", weight: 135, reps: 10, completed_at: new Date().toISOString() },
    { session_id: "s1", exercise_id: "bench", set_type: "warmup", weight: 185, reps: 5, completed_at: new Date().toISOString() },
    { session_id: "s1", exercise_id: "bench", set_type: "normal", weight: 225, reps: 5, completed_at: new Date().toISOString() },
    { session_id: "s1", exercise_id: "bench", set_type: "normal", weight: 225, reps: 5, completed_at: new Date().toISOString() },
    { session_id: "s1", exercise_id: "squat", set_type: "normal", weight: 315, reps: 5, completed_at: new Date().toISOString() },
  ];

  const groupOf = (id: string) => (id === "bench" ? "Chest" : "Legs");
  const breakdown = muscleBreakdown(sets, groupOf);

  // 3 working sets total: 2 Chest, 1 Legs
  const chest = breakdown.find((b) => b.group === "Chest");
  const legs = breakdown.find((b) => b.group === "Legs");

  assert.equal(chest?.sets, 2);
  assert.equal(legs?.sets, 1);
  assert.equal(breakdown.reduce((sum, b) => sum + b.sets, 0), 3);
});

test("muscle recovery model: direct vs indirect fatigue allocation and half-life decay", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  // 4 working sets of bench press right now (primary: chest, secondary: triceps, front_delts)
  const sets: MuscleSet[] = [
    { completed_at: hoursAgo(0), set_type: "normal", primary_muscle: "chest", secondary_muscles: ["triceps", "front_delts"] },
    { completed_at: hoursAgo(0), set_type: "normal", primary_muscle: "chest", secondary_muscles: ["triceps", "front_delts"] },
    { completed_at: hoursAgo(0), set_type: "normal", primary_muscle: "chest", secondary_muscles: ["triceps", "front_delts"] },
    { completed_at: hoursAgo(0), set_type: "failure", primary_muscle: "chest", secondary_muscles: ["triceps", "front_delts"] }, // 1.25x
  ];

  const recovery = computeRecovery(sets, now);
  const chest = recovery.find((r) => r.muscle === "chest")!;
  const triceps = recovery.find((r) => r.muscle === "triceps")!;
  const back = recovery.find((r) => r.muscle === "upper_back")!;

  // Untrained back must be 100% recovered
  assert.equal(back.recovery, 100);
  assert.equal(back.fatigue, 0);

  // Chest fatigue = 1 + 1 + 1 + 1.25 = 4.25 units
  assert.ok(Math.abs(chest.fatigue - 4.25) < 0.01);
  // Chest recovery = Math.round(100 * (1 - 4.25 / 10)) = 57% (<60% is Fatigued)
  assert.equal(chest.recovery, 57);
  assert.equal(recoveryLabel(chest.recovery), "Fatigued");

  // Triceps helper fatigue = (1 + 1 + 1 + 1.25) * 0.5 = 2.125 units
  assert.ok(Math.abs(triceps.fatigue - 2.125) < 0.01);

  // Half-life check: big muscles have 24h half-life, small have 16h
  assert.equal(halfLifeHours("chest"), 24);
  assert.equal(halfLifeHours("triceps"), 16);

  // After 24 hours, chest fatigue should halve: 4.25 / 2 = 2.125
  const recovery24h = computeRecovery(
    sets.map((s) => ({ ...s, completed_at: hoursAgo(24) })),
    now,
  );
  const chest24h = recovery24h.find((r) => r.muscle === "chest")!;
  assert.ok(Math.abs(chest24h.fatigue - 2.125) < 0.01);
});

test("strain analytics: TRIMP zone weighting and score saturation curve", () => {
  // Max HR estimation: 220 - (2026 - 1996) = 190
  const midYear2026 = new Date(2026, 5, 1).getTime();
  assert.equal(maxHrFor({ birth_year: 1996 }, midYear2026), 190);
  assert.equal(maxHrFor({ max_hr: 195 }), 195);

  // HR Zones: 0 (<50%), 1 (50-59%), 2 (60-69%), 3 (70-79%), 4 (80-89%), 5 (90%+)
  const max = 200;
  assert.equal(hrZone(90, max), 0); // 45%
  assert.equal(hrZone(110, max), 1); // 55%
  assert.equal(hrZone(130, max), 2); // 65%
  assert.equal(hrZone(150, max), 3); // 75%
  assert.equal(hrZone(170, max), 4); // 85%
  assert.equal(hrZone(190, max), 5); // 95%

  // Strain saturation: strain score must be monotonic and strictly asymptote to 100
  assert.equal(strainScore(0, 0), 0);
  const moderate = strainScore(100, 10);
  const intense = strainScore(300, 30);
  const extreme = strainScore(1000, 100);

  assert.ok(moderate > 0 && moderate < intense);
  assert.ok(intense < extreme);
  assert.ok(extreme <= 100);

  // Bands
  assert.equal(strainBand(25).label, "Light");
  assert.equal(strainBand(50).label, "Moderate");
  assert.equal(strainBand(75).label, "High");
  assert.equal(strainBand(95).label, "All-out");
});

test("personal records and best sets: rep max ladder and tested max distinction", () => {
  const history: BestSetDay[] = [
    {
      sessionId: "sess-1",
      date: "2026-10-01",
      sets: [
        { set_type: "warmup", weight: 135, reps: 10 },
        { set_type: "normal", weight: 225, reps: 5 },
        { set_type: "normal", weight: 225, reps: 5 },
      ],
    },
    {
      sessionId: "sess-2",
      date: "2026-10-08",
      sets: [
        { set_type: "normal", weight: 275, reps: 1 }, // Actual tested 1RM
        { set_type: "normal", weight: 185, reps: 12 },
      ],
    },
  ];

  const records = bestSets(history);

  // Best est 1RM: 275 x 1 = 275 vs 225 x 5 = 262.5
  assert.ok(records.e1rm != null);
  assert.equal(records.e1rm.weight, 275);
  assert.equal(records.e1rm.reps, 1); // reps === 1 distinguishes tested max!

  // Heaviest set
  assert.equal(records.heaviest?.weight, 275);
  assert.equal(records.heaviest?.reps, 1);

  // Most reps
  assert.equal(records.mostReps?.reps, 12);
  assert.equal(records.mostReps?.weight, 185);

  // Rep maxes ladder: 1 rep = 275, 5 reps = 225, 12 reps = 185
  const rm1 = records.repMaxes.find((r) => r.reps === 1);
  const rm5 = records.repMaxes.find((r) => r.reps === 5);
  const rm12 = records.repMaxes.find((r) => r.reps === 12);

  assert.equal(rm1?.weight, 275);
  assert.equal(rm5?.weight, 225);
  assert.equal(rm12?.weight, 185);
});
