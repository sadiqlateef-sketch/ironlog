import { test } from "node:test";
import assert from "node:assert/strict";
import { brzycki, epley, repsAtPercent, roundToPlates } from "../src/lib/one-rm.ts";
import { computeRecovery, recoveryLabel, type MuscleSet } from "../src/lib/recovery.ts";

const now = new Date("2026-10-13T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const bench = (h: number, type: MuscleSet["set_type"] = "normal"): MuscleSet => ({
  completed_at: hoursAgo(h),
  set_type: type,
  primary_muscle: "chest",
  secondary_muscles: ["triceps", "front_delts"],
});
const get = (r: ReturnType<typeof computeRecovery>, m: string) => r.find((x) => x.muscle === m)!;

test("epley and brzycki", () => {
  assert.equal(Math.round(epley(225, 5)), 263);
  assert.equal(epley(300, 1), 300);
  assert.equal(Math.round(brzycki(225, 5)), 253);
  assert.equal(brzycki(100, 40), 0);
});

test("reps at percent and plate rounding", () => {
  assert.equal(repsAtPercent(100), 1);
  assert.equal(repsAtPercent(85), 5);
  assert.equal(roundToPlates(263.4, "imperial"), 265);
  assert.equal(roundToPlates(101.4, "metric"), 102.5);
});

test("untrained muscles are fully recovered", () => {
  const r = computeRecovery([], now);
  assert.ok(r.every((m) => m.recovery === 100 && m.hoursToReady === 0));
});

test("10 fresh chest sets = 0%, one half-life later = 50%", () => {
  const fresh = computeRecovery(Array.from({ length: 10 }, () => bench(0)), now);
  assert.equal(get(fresh, "chest").recovery, 0);
  assert.equal(get(fresh, "chest").sets, 10);
  assert.equal(get(fresh, "triceps").recovery, 50); // helpers get half
  const dayLater = computeRecovery(Array.from({ length: 10 }, () => bench(24)), now);
  assert.equal(get(dayLater, "chest").recovery, 50);
});

test("small muscles recover faster than big ones", () => {
  const sets: MuscleSet[] = Array.from({ length: 6 }, () => ({
    completed_at: hoursAgo(24), set_type: "normal", primary_muscle: "biceps", secondary_muscles: [],
  }));
  const bigSets = Array.from({ length: 6 }, () => bench(24));
  assert.ok(get(computeRecovery(sets, now), "biceps").recovery > get(computeRecovery(bigSets, now), "chest").recovery);
});

test("warm-ups don't count, failure sets count more", () => {
  assert.equal(get(computeRecovery([bench(0, "warmup")], now), "chest").recovery, 100);
  assert.ok(get(computeRecovery([bench(0, "failure")], now), "chest").recovery < get(computeRecovery([bench(0)], now), "chest").recovery);
});

test("hours to ready", () => {
  const r = get(computeRecovery(Array.from({ length: 8 }, () => bench(0)), now), "chest");
  // 8 units -> 1 unit needs log2(8) = 3 half-lives = 72 h
  assert.equal(r.hoursToReady, 72);
  assert.equal(recoveryLabel(r.recovery), "Fatigued");
});
