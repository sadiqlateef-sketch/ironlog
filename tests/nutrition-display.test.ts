import test from "node:test";
import assert from "node:assert/strict";
import { amountText, parseAmount, showNutrient } from "../src/lib/nutrition/display.ts";
import { complete, incomplete } from "../src/lib/nutrition/nutrients.ts";

test("showNutrient shows mg for sodium and caffeine, g for the rest", () => {
  assert.equal(showNutrient("sodium", complete(0.25)), "250");
  assert.equal(showNutrient("caffeine", complete(0.095)), "95");
  assert.equal(showNutrient("protein", complete(12.4)), "12");
});

test("showNutrient marks incomplete totals and unknowns", () => {
  assert.equal(showNutrient("fiber", { value: 3, state: "incomplete" }), "≥ 3");
  assert.equal(showNutrient("fiber", incomplete()), "–");
});

test("amountText reads naturally", () => {
  assert.equal(amountText(150, "g"), "150 g");
  assert.equal(amountText(2, "serving"), "2 servings");
  assert.equal(amountText(1, "serving"), "1 serving");
  assert.equal(amountText(1, "fl_oz"), "1 fl oz");
  assert.equal(amountText(1, "quick"), "Quick add");
});

test("parseAmount accepts positive numbers and a decimal comma only", () => {
  assert.equal(parseAmount("2,5"), 2.5);
  assert.equal(parseAmount(" 40 "), 40);
  assert.equal(parseAmount("0"), null);
  assert.equal(parseAmount("-1"), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount(""), null);
});
