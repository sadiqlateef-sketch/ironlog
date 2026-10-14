import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bmi,
  bmiCategory,
  cmToFtIn,
  estimateBodyFat,
  ftInToCm,
  latestOf,
  leanMass,
  localDay,
  seriesOf,
  sparkPoints,
  waistToHeight,
  type Measurement,
} from "../src/lib/body.ts";

const rows: Measurement[] = [
  { measured_on: "2026-10-10", weight_kg: 82, body_fat_pct: null, waist_cm: 86 },
  { measured_on: "2026-10-01", weight_kg: 84, body_fat_pct: 20, waist_cm: null },
  { measured_on: "2026-10-12", weight_kg: null, body_fat_pct: 18.5, waist_cm: null },
];

test("bmi and its bands", () => {
  assert.equal(Math.round(bmi(80, 180) * 10) / 10, 24.7);
  assert.equal(bmiCategory(18.4), "Underweight");
  assert.equal(bmiCategory(24.9), "Healthy range");
  assert.equal(bmiCategory(25), "Overweight");
  assert.equal(bmiCategory(31), "Obesity range");
});

test("body fat estimate, lean mass and waist-to-height", () => {
  // Deurenberg: 1.2×24.7 + 0.23×28 − 10.8 − 5.4 ≈ 19.9
  assert.equal(Math.round(estimateBodyFat(24.7, 28, "male") * 10) / 10, 19.9);
  assert.ok(estimateBodyFat(24.7, 28, "female") > estimateBodyFat(24.7, 28, "male"));
  assert.equal(estimateBodyFat(10, 18, "male"), 3); // clamped
  assert.equal(leanMass(80, 20), 64);
  assert.equal(waistToHeight(90, 180), 0.5);
});

test("series skip missing days and sort oldest first", () => {
  assert.deepEqual(seriesOf(rows, "weight_kg"), [
    { date: "2026-10-01", value: 84 },
    { date: "2026-10-10", value: 82 },
  ]);
  assert.deepEqual(latestOf(rows, "body_fat_pct"), { value: 18.5, date: "2026-10-12", change: -1.5, since: "2026-10-01" });
  assert.deepEqual(latestOf(rows, "waist_cm"), { value: 86, date: "2026-10-10", change: null, since: "2026-10-10" });
  assert.equal(latestOf([], "weight_kg"), null);
});

test("height conversions round-trip", () => {
  assert.deepEqual(cmToFtIn(177.8), { ft: 5, in: 10 });
  assert.equal(Math.round(ftInToCm(5, 10) * 10) / 10, 177.8);
});

test("sparkline points fit the box", () => {
  assert.equal(sparkPoints([], 60, 20), "");
  assert.equal(sparkPoints([5], 60, 20), "30.0,10.0");
  assert.equal(sparkPoints([1, 2, 3], 60, 20), "2.0,18.0 30.0,10.0 58.0,2.0");
  assert.equal(localDay(new Date(2026, 0, 5, 23, 30)), "2026-01-05");
});
