import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTempo, calculateTUT, formatTUT, tutStimulusCategory } from "../src/lib/tempo.ts";
import { simulateWorkout, type SimulatedExercise } from "../src/lib/simulation.ts";
import { explainSubstitution } from "../src/lib/substitution-engine.ts";
import type { Exercise } from "../src/lib/workout-api.ts";
import type { MuscleSet } from "../src/lib/recovery.ts";

test("tempo: parses 4-digit and hyphenated notation accurately", () => {
  const p1 = parseTempo("3-1-1-0");
  assert.deepEqual(p1, { eccentric: 3, pauseBottom: 1, concentric: 1, pauseTop: 0, secondsPerRep: 5 });

  const p2 = parseTempo("30X0");
  assert.deepEqual(p2, { eccentric: 3, pauseBottom: 0, concentric: 1, pauseTop: 0, secondsPerRep: 4 });

  assert.equal(parseTempo(""), null);
  assert.equal(parseTempo("invalid"), null);
});

test("tempo: calculates time-under-tension correctly", () => {
  // 8 reps with 3-1-1-0 (5s/rep) = 40s
  assert.equal(calculateTUT("3-1-1-0", 8), 40);
  assert.equal(calculateTUT(null, 10), 30); // fallback 3s per rep
  assert.equal(formatTUT(45), "45s");
  assert.equal(formatTUT(75), "1m 15s");

  assert.equal(tutStimulusCategory(35).label, "Functional Hypertrophy");
  assert.equal(tutStimulusCategory(10).label, "Max Strength");
});

test("simulation: accurately models forward fatigue and recovery delta", () => {
  const now = new Date();
  const planned: SimulatedExercise[] = [
    {
      name: "Bench Press",
      primary_muscle: "chest",
      secondary_muscles: ["triceps", "front_delts"],
      sets: 4,
    },
    {
      name: "Incline Dumbbell Press",
      primary_muscle: "chest",
      secondary_muscles: ["triceps", "front_delts"],
      sets: 3,
    },
  ];

  const emptyHistory: MuscleSet[] = [];
  const res = simulateWorkout(planned, emptyHistory, now);

  assert.equal(res.totalWorkingSets, 7);
  assert.ok(res.projectedStrain > 0);

  // Chest should drop in recovery
  const chestImpact = res.impactedMuscles.find((m) => m.muscle === "chest");
  assert.ok(chestImpact);
  assert.equal(chestImpact.currentRecovery, 100);
  assert.ok(chestImpact.projectedRecovery < 100);
  assert.ok(chestImpact.hoursToReady > 0);
});

test("substitutions: explains biomechanical and joint load trade-offs", () => {
  const barbellBench = {
    id: "ex-1",
    name: "Barbell Bench Press",
    slug: "barbell-bench-press",
    equipment: "barbell",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    mechanic: "compound",
    aliases: [],
    custom: false,
    tracking: "weight_reps",
    weight_step: 5,
  } as unknown as Exercise;

  const dbBench = {
    id: "ex-2",
    name: "Dumbbell Bench Press",
    slug: "dumbbell-bench-press",
    equipment: "dumbbell",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    mechanic: "compound",
    aliases: [],
    custom: false,
    tracking: "weight_reps",
    weight_step: 5,
  } as unknown as Exercise;

  const explanation = explainSubstitution(barbellBench, dbBench);
  assert.equal(explanation.jointImpact, "lower");
  assert.ok(explanation.tags.includes("Joint-Friendly"));
  assert.ok(explanation.rationale.length > 10);
});
