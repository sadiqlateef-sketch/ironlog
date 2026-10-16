import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, type ExportSet } from "../src/lib/export-csv.ts";

const base: ExportSet = {
  start_time: "2026-10-15T14:00:00",
  workout: "Push, day A",
  exercise: "Bench Press",
  set_number: 1,
  set_type: "normal",
  weight: 100,
  reps: 5,
  rpe: 8,
  duration_seconds: null,
  distance_m: null,
  notes: 'felt "easy"',
};

test("csv has a header, quotes commas and quotes, and converts units", () => {
  const lines = toCsv([base], "imperial").trim().split("\r\n");
  assert.equal(lines[0], "Date,Workout,Exercise,Set,Type,Weight (lb),Reps,RPE,Time (seconds),Distance (mi),Notes");
  assert.equal(lines[1], '2026-10-15,"Push, day A",Bench Press,1,normal,220.46,5,8,,,"felt ""easy"""');
});

test("cardio rows leave weight and reps blank", () => {
  const run = { ...base, exercise: "Treadmill Run", weight: 0, reps: 0, rpe: null, notes: null, duration_seconds: 1500, distance_m: 5000 };
  const line = toCsv([run], "metric").trim().split("\r\n")[1];
  assert.equal(line, '2026-10-15,"Push, day A",Treadmill Run,1,normal,,,,1500,5,');
});
