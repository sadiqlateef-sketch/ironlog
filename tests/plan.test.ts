import { test } from "node:test";
import assert from "node:assert/strict";
import { agoLabel, buildInstantWorkout, estimateMinutes, itemMinutes, moveItem, setsLabel, topMuscles } from "../src/lib/workout-plan.ts";

test("estimate: 5 exercises of 3 sets with 2 min rest is about 35 min", () => {
  const items = Array.from({ length: 5 }, () => ({ target_sets: 3, warmup_sets: 0, rest_seconds: 120 }));
  // each: 60 + 135 + 240 = 435 s -> 2175 s = 36 min -> nearest 5
  assert.equal(estimateMinutes(items), 35);
  assert.equal(estimateMinutes([]), 5);
});

test("top muscles by count, ties keep first-seen order", () => {
  assert.deepEqual(topMuscles(["chest", "triceps", "chest", "front_delts", "triceps", "abs"], 2), ["chest", "triceps"]);
});

test("ago labels", () => {
  const now = new Date(2026, 9, 14, 18).getTime();
  assert.equal(agoLabel(new Date(2026, 9, 14, 7).toISOString(), now), "Today");
  assert.equal(agoLabel(new Date(2026, 9, 13, 23).toISOString(), now), "Yesterday");
  assert.equal(agoLabel(new Date(2026, 9, 7, 12).toISOString(), now), "7d ago");
  assert.equal(agoLabel(new Date(2026, 8, 16).toISOString(), now), "4w ago");
  assert.equal(agoLabel(new Date(2026, 5, 1).toISOString(), now), "4mo ago");
});

test("sets label", () => {
  assert.equal(setsLabel({ target_sets: 3, target_reps: 8, target_reps_max: 10, warmup_sets: 0 }), "3 × 8–10 reps");
  assert.equal(setsLabel({ target_sets: 5, target_reps: 5, target_reps_max: null, warmup_sets: 2 }), "2 warm-up + 5 × 5 reps");
});

test("move item", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
  assert.deepEqual(moveItem(["a"], 0, 3), ["a"]);
});

const lib = [
  { id: "1", name: "Bench Press", primary_muscle: "chest", equipment: "barbell", mechanic: "compound", aliases: ["Bench"] },
  { id: "2", name: "Dumbbell Bench Press", primary_muscle: "chest", equipment: "dumbbell", mechanic: "compound", aliases: ["DB Bench"] },
  { id: "3", name: "Push-Up", primary_muscle: "chest", equipment: "bodyweight", mechanic: "compound" },
  { id: "4", name: "Cable Fly", primary_muscle: "chest", equipment: "cable", mechanic: "isolation" },
  { id: "5", name: "Pushdown", primary_muscle: "triceps", equipment: "cable", mechanic: "isolation" },
  { id: "6", name: "Crunch", primary_muscle: "abs", equipment: "bodyweight", mechanic: "isolation" },
  { id: "7", name: "Squat", primary_muscle: "quads", equipment: "barbell", mechanic: "compound" },
];

test("instant: fits the time, matches target, titles with abs", () => {
  const w = buildInstantWorkout(lib, { minutes: 30, equipment: "gym", target: "chest" }, 7);
  assert.ok(w.items.length >= 3);
  assert.ok(w.items.reduce((t, x) => t + itemMinutes(x), 0) <= 30);
  assert.ok(w.items.every((x) => ["chest", "triceps", "abs"].includes(x.exercise.primary_muscle)));
  assert.equal(w.items[0].exercise.mechanic, "compound");
  assert.equal(new Set(w.items.map((x) => x.exercise.id)).size, w.items.length);
  assert.equal(w.title, w.items.some((x) => x.exercise.primary_muscle === "abs") ? "30 min Chest & Abs Workout" : "30 min Chest Workout");
});

test("instant: equipment filter and same seed gives same workout", () => {
  const w = buildInstantWorkout(lib, { minutes: 45, equipment: "bodyweight", target: "chest" }, 3);
  assert.ok(w.items.every((x) => x.exercise.equipment === "bodyweight"));
  assert.deepEqual(
    buildInstantWorkout(lib, { minutes: 45, equipment: "gym", target: "full" }, 9).items.map((x) => x.exercise.id),
    buildInstantWorkout(lib, { minutes: 45, equipment: "gym", target: "full" }, 9).items.map((x) => x.exercise.id),
  );
});
