import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePlates } from "../src/lib/plates.ts";
import {
  formatClock,
  nextSetType,
  parseNumber,
  shouldStartRest,
  workingSetNumbers,
} from "../src/lib/workout-logic.ts";

test("plates: 225 lb on a 45 lb bar is two 45s per side", () => {
  assert.deepEqual(calculatePlates(225, 45, [45, 35, 25, 10, 5, 2.5]), { perSide: [45, 45], achieved: 225, remainder: 0 });
});

test("plates: 185 lb mixes plates", () => {
  assert.deepEqual(calculatePlates(185, 45, [45, 35, 25, 10, 5, 2.5]).perSide, [45, 25]);
});

test("plates: 102.5 kg metric", () => {
  assert.deepEqual(calculatePlates(102.5, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide, [25, 15, 1.25]);
});

test("plates: unreachable target reports remainder", () => {
  const r = calculatePlates(137, 45, [45, 35, 25, 10, 5, 2.5]);
  assert.equal(r.achieved, 135);
  assert.equal(r.remainder, 2);
});

test("plates: target at or below bar needs no plates", () => {
  assert.deepEqual(calculatePlates(45, 45, [45]).perSide, []);
});

test("set type cycles", () => {
  assert.equal(nextSetType("normal"), "warmup");
  assert.equal(nextSetType("failure"), "normal");
});

test("working set numbers skip warm-ups", () => {
  assert.deepEqual(workingSetNumbers(["warmup", "warmup", "normal", "normal", "drop"]), [0, 0, 1, 2, 2]);
});

test("parseNumber", () => {
  assert.equal(parseNumber("102,5"), 102.5);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("abc"), null);
});

test("supersets rest only after the last exercise in the group", () => {
  const ex = [
    { order: 1, supersetGroup: 1 },
    { order: 2, supersetGroup: 1 },
    { order: 3, supersetGroup: null },
  ];
  assert.equal(shouldStartRest(1, 1, ex), false);
  assert.equal(shouldStartRest(2, 1, ex), true);
  assert.equal(shouldStartRest(3, null, ex), true);
});

test("clock format", () => {
  assert.equal(formatClock(125), "2:05");
  assert.equal(formatClock(-3), "0:00");
});
