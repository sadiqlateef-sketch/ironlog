import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseSpokenSet } from "../src/lib/voice-set.ts";

const ex = [
  { key: 1, name: "Barbell Bench Press", aliases: ["Bench"] },
  { key: 2, name: "Back Squat" },
  { key: 3, name: "Conventional Deadlift" },
  { key: 4, name: "Overhead Press", aliases: ["OHP"] },
  { key: 5, name: "Dumbbell Row" },
  { key: 6, name: "Pull-Up" },
  { key: 7, name: "Incline Dumbbell Bench Press" },
];
const p = (t: string) => parseSpokenSet(t, ex);

test("voice: weight for reps, with the exercise named", () => {
  assert.deepEqual(p("bench 185 for 8"), { weight: 185, unit: null, reps: 8, bodyweight: false, exercise: 1, unknownExercise: false });
  assert.equal(p("squat 225 x 5")?.exercise, 2);
  assert.deepEqual([p("deadlift 315 by 3")?.weight, p("deadlift 315 by 3")?.reps, p("deadlift 315 by 3")?.exercise], [315, 3, 3]);
  assert.equal(p("OHP 95 times 6")?.exercise, 4);
  assert.equal(p("rows 70 for 10")?.exercise, 5);
  assert.equal(p("incline dumbbell bench 60 for 10")?.exercise, 7);
});

test("voice: no exercise means the one you're on", () => {
  const r = p("185 for 8");
  assert.equal(r?.exercise, null);
  assert.equal(r?.unknownExercise, false);
  assert.deepEqual([r?.weight, r?.reps], [185, 8]);
});

test("voice: number words the way lifters say them", () => {
  assert.deepEqual([p("one eighty five for eight")?.weight, p("one eighty five for eight")?.reps], [185, 8]);
  assert.equal(p("two twenty five for five")?.weight, 225);
  assert.equal(p("a hundred and thirty five for ten")?.weight, 135);
  assert.equal(p("one hundred for twelve")?.weight, 100);
  assert.equal(p("ninety five for twelve")?.weight, 95);
  assert.equal(p("forty two and a half for 10")?.weight, 42.5);
  assert.equal(p("three fifteen for three")?.weight, 315);
  assert.equal(p("102.5 kilos for 5")?.weight, 102.5);
});

test("voice: units, reps first, misheard 'for'", () => {
  assert.deepEqual(p("8 reps at 60 kilos"), { weight: 60, unit: "kg", reps: 8, bodyweight: false, exercise: null, unknownExercise: false });
  assert.equal(p("185 pounds for 8")?.unit, "lb");
  assert.equal(p("100kg for 5")?.unit, "kg");
  assert.deepEqual([p("bench 185 4 8")?.weight, p("bench 185 4 8")?.reps], [185, 8]);
  assert.deepEqual([p("185 8")?.weight, p("185 8")?.reps], [185, 8]);
});

test("voice: reps only, bodyweight, same weight", () => {
  assert.deepEqual([p("8 reps")?.weight, p("8 reps")?.reps], [null, 8]);
  assert.deepEqual([p("same for 6")?.weight, p("same for 6")?.reps], [null, 6]);
  const bw = p("pull ups bodyweight for 12");
  assert.deepEqual([bw?.weight, bw?.reps, bw?.bodyweight, bw?.exercise], [0, 12, true, 6]);
  assert.deepEqual([p("10")?.reps, p("10")?.weight], [10, null]);
  assert.deepEqual([p("185")?.weight, p("185")?.reps], [185, null]);
});

test("voice: nothing to log, or an exercise that isn't in the workout", () => {
  assert.equal(p("what's next"), null);
  assert.equal(p(""), null);
  const r = p("leg press 300 for 10");
  assert.equal(r?.exercise, null);
  assert.equal(r?.unknownExercise, true);
});

test("voice: the watch's copy of the parser matches the phone's", () => {
  const phone = readFileSync(new URL("../src/lib/voice-set.ts", import.meta.url), "utf8");
  const watch = readFileSync(new URL("../watch/src/voiceSet.ts", import.meta.url), "utf8");
  assert.equal(watch, phone);
});
