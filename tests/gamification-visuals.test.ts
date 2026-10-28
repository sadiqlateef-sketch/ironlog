import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWorkoutDNA } from "../src/lib/dna.ts";
import { evaluateTrophies } from "../src/lib/trophies.ts";
import type { StatSession, StatSet } from "../src/lib/stats.ts";
import type { Exercise } from "../src/lib/workout-api.ts";

test("dna: generates balanced archetype and concentric polar arcs", () => {
  const sessions: StatSession[] = [
    { id: "s1", name: "Push Day", start_time: new Date(Date.now() - 2 * 86400000).toISOString(), end_time: null, volume: 15000 },
    { id: "s2", name: "Pull Day", start_time: new Date(Date.now() - 5 * 86400000).toISOString(), end_time: null, volume: 18000 },
  ];

  const sets: StatSet[] = [
    { session_id: "s1", exercise_id: "bench", set_type: "normal", weight: 225, reps: 8, completed_at: new Date().toISOString() },
    { session_id: "s2", exercise_id: "row", set_type: "failure", weight: 185, reps: 5, completed_at: new Date().toISOString() },
  ];

  const exercises = new Map<string, Exercise>([
    [
      "bench",
      {
        id: "bench",
        name: "Bench Press",
        slug: "bench-press",
        equipment: "barbell",
        primary_muscle: "chest",
        secondary_muscles: ["triceps"],
        mechanic: "compound",
      } as unknown as Exercise,
    ],
    [
      "row",
      {
        id: "row",
        name: "Barbell Row",
        slug: "barbell-row",
        equipment: "barbell",
        primary_muscle: "upper_back",
        secondary_muscles: ["biceps"],
        mechanic: "compound",
      } as unknown as Exercise,
    ],
  ]);

  const dna = computeWorkoutDNA(sessions, sets, exercises);
  assert.ok(dna.archetype.title.length > 0);
  assert.equal(dna.polarArcs.length, 4);
  assert.equal(dna.traits.length, 4);
  assert.ok(dna.statsSummary.totalVolume > 0);
});

test("trophies: evaluates milestones, big 3 totals, and unlocks", () => {
  const sessions: StatSession[] = [
    { id: "s1", name: "Heavy Day", start_time: new Date().toISOString(), end_time: null, volume: 550000 },
  ];

  const sets: StatSet[] = [
    { session_id: "s1", exercise_id: "bench", set_type: "normal", weight: 275, reps: 5, completed_at: new Date().toISOString() },
    { session_id: "s1", exercise_id: "squat", set_type: "normal", weight: 405, reps: 3, completed_at: new Date().toISOString() },
    { session_id: "s1", exercise_id: "deadlift", set_type: "normal", weight: 495, reps: 2, completed_at: new Date().toISOString() },
  ];

  const exercises = new Map<string, Exercise>([
    ["bench", { id: "bench", slug: "bench-press", name: "Bench Press" } as unknown as Exercise],
    ["squat", { id: "squat", slug: "barbell-squat", name: "Squat" } as unknown as Exercise],
    ["deadlift", { id: "deadlift", slug: "barbell-deadlift", name: "Deadlift" } as unknown as Exercise],
  ]);

  const trophies = evaluateTrophies(sessions, sets, exercises, 105, 14);

  // 1000lb club should be unlocked (275*1.16 + 405*1.1 + 495*1.06 > 1000)
  const club1000 = trophies.find((t) => t.id === "1000lb-club");
  assert.ok(club1000);
  assert.equal(club1000.unlocked, true);

  // Century club should be unlocked (105 >= 100)
  const century = trophies.find((t) => t.id === "century-club");
  assert.ok(century);
  assert.equal(century.unlocked, true);

  // Iron discipline should be unlocked (14 >= 12 weeks)
  const streakTrophy = trophies.find((t) => t.id === "iron-streak");
  assert.ok(streakTrophy);
  assert.equal(streakTrophy.unlocked, true);
});
