import { test } from "node:test";
import assert from "node:assert/strict";
import { getEquipmentZone, isAntagonist, findOptimalSupersets, type ExerciseLike } from "../src/lib/equipment-routing.ts";

test("getEquipmentZone maps equipment types to physical gym sectors", () => {
  assert.equal(getEquipmentZone("barbell"), "free_weights");
  assert.equal(getEquipmentZone("dumbbell"), "free_weights");
  assert.equal(getEquipmentZone("cable"), "cables");
  assert.equal(getEquipmentZone("machine"), "machines");
  assert.equal(getEquipmentZone("bodyweight"), "bodyweight");
  assert.equal(getEquipmentZone("treadmill"), "cardio");
  assert.equal(getEquipmentZone(null), "other");
});

test("isAntagonist identifies push/pull and flexion/extension pairs", () => {
  assert.equal(isAntagonist("chest", "upper_back"), true);
  assert.equal(isAntagonist("biceps", "triceps"), true);
  assert.equal(isAntagonist("quads", "hamstrings"), true);
  assert.equal(isAntagonist("chest", "front_delts"), false);
});

test("findOptimalSupersets ranks same-station antagonist pairings highest", () => {
  const benchPress: ExerciseLike = {
    id: "ex-1",
    name: "Barbell Bench Press",
    equipment: "barbell",
    primary_muscle: "chest",
  };

  const candidates: ExerciseLike[] = [
    {
      id: "ex-2",
      name: "Barbell Bent Over Row",
      equipment: "barbell", // Same station (free weights) + Antagonist (upper_back)
      primary_muscle: "upper_back",
    },
    {
      id: "ex-3",
      name: "Incline Dumbbell Press",
      equipment: "dumbbell", // Same muscle overlap
      primary_muscle: "chest",
    },
    {
      id: "ex-4",
      name: "Leg Extension Machine",
      equipment: "machine", // Cross-gym machine non-competing
      primary_muscle: "quads",
    },
  ];

  const ranked = findOptimalSupersets(benchPress, candidates);
  assert.equal(ranked[0].exercise.id, "ex-2");
  assert.equal(ranked[0].proximity, "Same Station");
  assert.equal(ranked[0].pairingType, "Antagonist");
  assert.ok(ranked[0].score >= 80);

  // Bench + Incline press should rank lowest due to fatigue overlap
  assert.equal(ranked[ranked.length - 1].exercise.id, "ex-3");
});
