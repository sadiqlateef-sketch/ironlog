import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, thinHeartRate, toHealthWorkout, weightsToImport, workoutNotes, workoutType, type FinishedSet } from "../src/lib/health-logic.ts";

const lift = (name: string, weight: number, reps: number, set_type = "normal"): FinishedSet => ({
  set_type,
  weight,
  reps,
  duration_seconds: null,
  distance_m: null,
  exercise: { name, slug: name.toLowerCase().replace(/ /g, "-"), tracking: "weight_reps" },
});
const cardio = (slug: string, seconds: number, metres: number): FinishedSet => ({
  set_type: "normal",
  weight: 0,
  reps: 0,
  duration_seconds: seconds,
  distance_m: metres,
  exercise: { name: slug, slug, tracking: "distance_time" },
});

test("lifting is strength training, even with a treadmill finisher", () => {
  assert.equal(workoutType([lift("Bench Press", 100, 5), cardio("treadmill-run", 600, 1600)]), "strength");
});

test("a cardio-only workout takes the machine's type", () => {
  assert.equal(workoutType([cardio("treadmill-run", 1500, 5000)]), "running_treadmill");
  assert.equal(workoutType([cardio("stationary-bike", 1200, 8000), cardio("stationary-bike", 600, 4000)]), "biking_stationary");
  assert.equal(workoutType([cardio("walk", 1200, 2000), cardio("rowing-machine", 600, 2000)]), "other");
});

test("notes list each exercise with its top set, skipping warm-ups", () => {
  const notes = workoutNotes([lift("Squat", 60, 5, "warmup"), lift("Squat", 140, 5), lift("Squat", 140, 3), lift("Pull-up", 0, 10)], "metric");
  assert.equal(notes, "Squat: 2 sets, top 140 kg x 5\nPull-up: 1 set, best 10 reps");
});

test("cardio notes show distance and time", () => {
  assert.match(workoutNotes([cardio("outdoor-run", 1500, 5000)], "metric"), /^outdoor-run: 5 km in 25:00/);
});

test("a workout becomes one Health Connect session with its total distance", () => {
  const w = toHealthWorkout(
    { id: "a", name: " Push day ", start_time: "2026-10-16T10:00:00Z", end_time: "2026-10-16T11:00:00Z", sets: [cardio("walk", 600, 1000.123), cardio("walk", 600, 500)] },
    "metric",
  );
  assert.deepEqual({ ...w, notes: undefined }, {
    id: "a",
    start: "2026-10-16T10:00:00.000Z",
    end: "2026-10-16T11:00:00.000Z",
    type: "walking",
    title: "Push day",
    notes: undefined,
    distanceM: 1500.12,
  });
  assert.equal(toHealthWorkout({ id: "b", name: null, start_time: "2026-10-16T10:00:00Z", end_time: "2026-10-16T11:00:00Z", sets: [] }, "metric"), null);
});

test("the fingerprint changes only when the workout does", () => {
  const base = { id: "a", start: "s", end: "e", type: "strength" as const, title: "t", notes: "n", distanceM: 0 };
  assert.equal(fingerprint(base), fingerprint({ ...base }));
  assert.notEqual(fingerprint(base), fingerprint({ ...base, notes: "n2" }));
});

test("heart rate is thinned to one reading every 5 seconds and kept in range", () => {
  const t = (s: number) => new Date(Date.UTC(2026, 9, 16, 10, 0, s)).toISOString();
  const rows = thinHeartRate([
    { time: t(3), bpm: 121 },
    { time: t(0), bpm: 120 },
    { time: t(5), bpm: 300 },
    { time: t(6), bpm: 125.4 },
  ]);
  assert.deepEqual(rows, [
    { recorded_at: t(0), bpm: 120 },
    { recorded_at: t(6), bpm: 125 },
  ]);
});

test("weigh-ins: last one of each day, only for days without a weight", () => {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const out = weightsToImport(
    [
      { time: "2026-10-14T07:00:00Z", kg: 80.04 },
      { time: "2026-10-14T20:00:00Z", kg: 81.26 },
      { time: "2026-10-15T07:00:00Z", kg: 80.5 },
      { time: "2026-10-16T07:00:00Z", kg: 5 },
    ],
    new Set(["2026-10-15"]),
    day,
  );
  assert.deepEqual(out, [{ day: "2026-10-14", kg: 81.3 }]);
});
