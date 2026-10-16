import { test } from "node:test";
import assert from "node:assert/strict";
import { describeTimedSet, formatDuration, pace, parseDuration, toDistanceDisplay, toMetres } from "../src/lib/cardio.ts";

test("durations parse from seconds or m:ss", () => {
  assert.equal(parseDuration("90"), 90);
  assert.equal(parseDuration("1:30"), 90);
  assert.equal(parseDuration("1:02:30"), 3750);
  assert.equal(parseDuration(""), null);
  assert.equal(parseDuration("1.5"), null);
  assert.equal(formatDuration(90), "1:30");
  assert.equal(formatDuration(3750), "1:02:30");
});

test("distance and pace follow the unit", () => {
  assert.equal(toDistanceDisplay(toMetres(3.1, "imperial"), "imperial"), "3.1");
  assert.equal(toMetres(5, "metric"), 5000);
  assert.equal(pace(1500, 5000, "metric"), "5:00 /km");
  assert.equal(pace(1500, null, "metric"), null);
});

test("timed sets read naturally", () => {
  const w = (kg: number) => `${kg} kg`;
  assert.equal(describeTimedSet({ weight: 0, duration_seconds: 1500, distance_m: 5000 }, "metric", w), "5 km in 25:00 (5:00 /km)");
  assert.equal(describeTimedSet({ weight: 10, duration_seconds: 60, distance_m: null }, "metric", w), "1:00 +10 kg");
  assert.equal(describeTimedSet({ weight: 100, duration_seconds: null, distance_m: null }, "metric", w), null);
});
