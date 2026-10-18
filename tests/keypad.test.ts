import { test } from "node:test";
import assert from "node:assert/strict";
import { dropWeight, pressKey, stepFor, stepValue } from "../src/lib/keypad.ts";
import { formatWeight, weightInput } from "../src/lib/units.ts";

test("first digit replaces the value, later digits append", () => {
  assert.equal(pressKey("225", "2", "weight", true), "2");
  assert.equal(pressKey("2", "3", "weight", false), "23");
  assert.equal(pressKey("225", "back", "weight", true), "");
  assert.equal(pressKey("225", "back", "weight", false), "22");
});

test("decimal point only for weight and distance, two decimals max", () => {
  assert.equal(pressKey("", ".", "weight", true), "0.");
  assert.equal(pressKey("42.", ".", "weight", false), "42.");
  assert.equal(pressKey("8", ".", "reps", false), "8");
  assert.equal(pressKey("41.25", "5", "weight", false), "41.25");
  assert.equal(pressKey("0", "8", "reps", false), "8");
});

test("time takes a colon once", () => {
  assert.equal(pressKey("1", ":", "time", false), "1:");
  assert.equal(pressKey("1:", ":", "time", false), "1:");
  assert.equal(pressKey("1:30", "0", "time", false), "1:30");
});

test("- / + start from last time when empty and never go below zero", () => {
  assert.equal(stepValue("", "225", 5, "weight"), "230");
  assert.equal(stepValue("135", "225", -2.5, "weight"), "132.5");
  assert.equal(stepValue("2", "", -5, "weight"), "0");
  assert.equal(stepValue("", "8", 1, "reps"), "9");
  assert.equal(stepValue("1:00", "", 5, "time"), "1:05");
  assert.equal(stepValue("0.1", "", 0.2, "distance"), "0.3");
  assert.equal(stepFor("reps", 5), 1);
  assert.equal(stepFor("weight", 2.5), 2.5);
});

test("drop set is about 20% lighter on the step", () => {
  assert.equal(dropWeight(225, 5), 180);
  assert.equal(dropWeight(100, 2.5), 80);
  assert.equal(dropWeight(0, 5), 0);
});

test("logger weights round to 0.5 lb / 0.25 kg; display gets commas", () => {
  assert.equal(weightInput(72.5, "imperial"), "160"); // 159.84 lb
  assert.equal(weightInput(41.25, "metric"), "41.25");
  assert.equal(weightInput(0, "metric"), "");
  assert.equal(formatWeight(6240, "imperial"), "13,757 lb");
});
