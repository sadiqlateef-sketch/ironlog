import test from "node:test";
import assert from "node:assert/strict";
import { TEMPLATES } from "../src/lib/templates.ts";
import { bestE1rm, liveVolume, shouldStartRest, setLabel } from "../src/lib/workout-logic.ts";
import { epley, brzycki } from "../src/lib/one-rm.ts";
import { computeRecovery, halfLifeHours } from "../src/lib/recovery.ts";
import { recommendRestTime, type DynamicRestParams } from "../src/lib/dynamic-rest.ts";
import { explainSubstitution } from "../src/lib/substitution-engine.ts";
import { calculateTUT, formatTUT, tutStimulusCategory, parseTempo } from "../src/lib/tempo.ts";
import { computeWorkoutDNA } from "../src/lib/dna.ts";
import { evaluateTrophies } from "../src/lib/trophies.ts";
import type { StatSession, StatSet } from "../src/lib/stats.ts";
import type { Exercise } from "../src/lib/workout-api.ts";

test("Live Workout Flow: Template Initialization -> Warm-up Sequencer -> Dynamic Progression", () => {
  // 1. Select the newly added PHUL program
  const phul = TEMPLATES.find((t) => t.id === "phul-4day");
  assert.ok(phul, "PHUL program must exist in templates library");
  assert.equal(phul.days.length, 4);

  const upperPowerDay = phul.days[0];
  assert.equal(upperPowerDay.name, "Upper Power");
  const mainLift = upperPowerDay.items[0]; // bench-press
  assert.equal(mainLift.slug, "bench-press");
  assert.equal(mainLift.warmups, 2);

  // 2. Generate progressive warm-up sets based on target working load (100 kg)
  const targetWorkingWeight = 100;
  const warmupPercentages = [0.5, 0.75]; // 50kg, 75kg
  const warmupSets = warmupPercentages.map((pct, idx) => ({
    setNumber: idx + 1,
    weight: String(targetWorkingWeight * pct),
    reps: String(idx === 0 ? 8 : 5),
    type: "warmup" as const,
    done: true,
  }));

  assert.equal(warmupSets.length, 2);
  assert.equal(warmupSets[0].weight, "50");
  assert.equal(warmupSets[1].weight, "75");

  // Warm-up rest recommendation test
  const warmupRest = recommendRestTime({ isWarmup: true });
  assert.equal(warmupRest.seconds, 60);
  assert.equal(warmupRest.category, "Metabolic");

  // 3. Log sets during live workout session
  const workingSets = [
    { weight: "100", reps: "5", rpe: 7.5, type: "normal" as const, done: true },
    { weight: "100", reps: "5", rpe: 8.0, type: "normal" as const, done: true },
    { weight: "102.5", reps: "5", rpe: 8.5, type: "normal" as const, done: true },
    { weight: "105", reps: "5", rpe: 9.5, type: "normal" as const, done: true }, // Peak top set
  ];

  const allSets = [...warmupSets, ...workingSets];
  assert.equal(allSets.length, 6);
  assert.equal(setLabel("warmup", 1), "W");
  assert.equal(setLabel("warmup", 2), "W");
  assert.equal(setLabel("normal", 1), "1");

  // 4. Test rest timer triggering logic (Straight sets vs Supersets)
  const straightExerciseList = [{ order: 1, supersetGroup: null }];
  assert.equal(shouldStartRest(1, null, straightExerciseList), true);

  const supersetList = [
    { order: 1, supersetGroup: 1 },
    { order: 2, supersetGroup: 1 },
  ];
  // Set in first exercise of superset does not start rest timer
  assert.equal(shouldStartRest(1, 1, supersetList), false);
  // Set in final exercise of superset starts rest timer
  assert.equal(shouldStartRest(2, 1, supersetList), true);

  // Dynamic Rest recommendation adjusts based on RPE & intensity
  const topSetRestParams: DynamicRestParams = {
    exerciseName: "Barbell Bench Press",
    equipment: "barbell",
    repTarget: "5",
    rpe: 9.5,
  };
  const recommendation = recommendRestTime(topSetRestParams);
  // Heavy compound (180s) + 30s for high RPE >= 9 = 210s
  assert.equal(recommendation.seconds, 210);
  assert.equal(recommendation.category, "Max Strength");
  assert.ok(recommendation.rationale.includes("ATP-CP"));
  assert.ok(recommendation.rationale.includes("+30s added for high RPE effort"));

  // 5. PR / e1RM calculation
  // Peak set: 105 kg x 5 reps
  const calculatedE1rmEpley = epley(105, 5);
  const calculatedE1rmBrzycki = brzycki(105, 5);
  const bestSetE1rm = bestE1rm([
    { weight: 100, reps: 5 },
    { weight: 102.5, reps: 5 },
    { weight: 105, reps: 5 },
  ]);

  assert.equal(calculatedE1rmEpley, 105 * (1 + 5 / 30)); // 122.5 kg
  assert.ok(calculatedE1rmBrzycki > 115 && calculatedE1rmBrzycki < 125);
  assert.equal(bestSetE1rm, calculatedE1rmEpley);

  // 6. Mid-workout Exercise Substitution verification
  const originalExercise: Exercise = {
    id: "ex-bench-barbell",
    slug: "bench-press",
    name: "Barbell Bench Press",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "barbell",
    mechanic: "compound",
    tracking: "weight_reps",
    unilateral: false,
    aliases: [],
    image_urls: [],
    animation_url: null,
    instructions: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  };

  const candidateExercise: Exercise = {
    id: "ex-incline-dumbbell",
    slug: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    primary_muscle: "chest",
    secondary_muscles: ["triceps", "front_delts"],
    equipment: "dumbbell",
    mechanic: "compound",
    tracking: "weight_reps",
    unilateral: false,
    aliases: [],
    image_urls: [],
    animation_url: null,
    instructions: "",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
  };

  const swap = explainSubstitution(originalExercise, candidateExercise);
  assert.equal(swap.jointImpact, "lower");
  assert.equal(swap.badge, "Natural Path");
  assert.ok(swap.tags.includes("Joint-Friendly"));
  assert.ok(swap.rationale.includes("free wrist rotation"));

  // 7. Tempo & TUT calculation
  const tempoStr = "3-1-1-0";
  const parsed = parseTempo(tempoStr);
  assert.ok(parsed);
  assert.equal(parsed.secondsPerRep, 5);
  const tut = calculateTUT(tempoStr, 5); // 5 reps * 5s = 25s
  assert.equal(tut, 25);
  assert.equal(formatTUT(tut), "25s");

  const category = tutStimulusCategory(tut);
  assert.equal(category.label, "Functional Hypertrophy");
});

test("Live Workout Flow: Session Finish, Volume Accounting, Muscle Recovery & DNA", () => {
  // Workout block with warm-ups and working sets
  const exerciseBlock = {
    sets: [
      { weight: "50", reps: "8", type: "warmup" as const, done: true },
      { weight: "75", reps: "5", type: "warmup" as const, done: true },
      { weight: "100", reps: "5", type: "normal" as const, done: true },
      { weight: "100", reps: "5", type: "normal" as const, done: true },
      { weight: "102.5", reps: "5", type: "normal" as const, done: true },
      { weight: "105", reps: "5", type: "normal" as const, done: true },
    ],
  };

  // liveVolume strictly excludes warmups
  const workingVolume = liveVolume([exerciseBlock]);
  const expectedWorkingVolume = 100 * 5 + 100 * 5 + 102.5 * 5 + 105 * 5; // 500 + 500 + 512.5 + 525 = 2037.5 kg
  assert.equal(workingVolume, expectedWorkingVolume);

  // Recovery calculation across target muscle groups
  const chestHalfLife = halfLifeHours("chest");
  assert.ok(chestHalfLife >= 24, "Chest half life should be at least 24 hours");

  const completedSets = [
    {
      completed_at: new Date().toISOString(),
      set_type: "normal" as const,
      primary_muscle: "chest" as const,
      secondary_muscles: ["triceps" as const, "front_delts" as const],
    },
    {
      completed_at: new Date().toISOString(),
      set_type: "normal" as const,
      primary_muscle: "chest" as const,
      secondary_muscles: ["triceps" as const, "front_delts" as const],
    },
  ];

  const recoveryState = computeRecovery(completedSets);
  const chestRecovery = recoveryState.find((r) => r.muscle === "chest");
  assert.ok(chestRecovery);
  assert.ok(chestRecovery.recovery < 100, `Recently worked chest must show fatigue (< 100%), got ${chestRecovery.recovery}`);

  // Workout DNA fingerprint calculation
  const sessions: StatSession[] = [
    {
      id: "session-live-1",
      name: "PHUL Upper Power",
      start_time: new Date(Date.now() - 3600_000).toISOString(),
      end_time: new Date().toISOString(),
      volume: workingVolume,
    },
  ];

  const sets: StatSet[] = [
    { session_id: "session-live-1", exercise_id: "bench", set_type: "normal", weight: 235, reps: 5, completed_at: new Date().toISOString() },
    { session_id: "session-live-1", exercise_id: "bench", set_type: "normal", weight: 225, reps: 5, completed_at: new Date().toISOString() },
    { session_id: "session-live-1", exercise_id: "row", set_type: "normal", weight: 195, reps: 6, completed_at: new Date().toISOString() },
  ];

  const exercises = new Map<string, Exercise>([
    [
      "bench",
      {
        id: "bench",
        slug: "bench-press",
        name: "Barbell Bench Press",
        primary_muscle: "chest",
        secondary_muscles: ["triceps", "front_delts"],
        equipment: "barbell",
        mechanic: "compound",
      } as unknown as Exercise,
    ],
    [
      "row",
      {
        id: "row",
        slug: "barbell-row",
        name: "Bent-Over Row",
        primary_muscle: "upper_back",
        secondary_muscles: ["biceps", "lats"],
        equipment: "barbell",
        mechanic: "compound",
      } as unknown as Exercise,
    ],
  ]);

  const dna = computeWorkoutDNA(sessions, sets, exercises);
  assert.ok(dna.archetype.title.length > 0);
  assert.equal(dna.polarArcs.length, 4);
  assert.equal(dna.traits.length, 4);
  assert.ok(dna.statsSummary.totalVolume > 0);

  // Trophy evaluation on workout completion (105 total sessions unlocks Century Club, 14 weeks unlocks Iron Streak, 235lb bench unlocks Two-Plate)
  const trophies = evaluateTrophies(sessions, sets, exercises, 105, 14);
  assert.ok(trophies.length > 0);
  const unlocked = trophies.filter((t) => t.unlocked);
  assert.ok(unlocked.length >= 1, `Expected at least 1 unlocked trophy, found ${unlocked.length}`);
  assert.ok(unlocked.some((t) => t.id === "century-club"));
  assert.ok(unlocked.some((t) => t.id === "iron-streak"));
  assert.ok(unlocked.some((t) => t.id === "two-plate-bench"));
});
