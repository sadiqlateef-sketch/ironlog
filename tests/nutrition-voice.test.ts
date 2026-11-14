import test from "node:test";
import assert from "node:assert/strict";
import { amountFor, candidatesFor, matchFoods, parseSpokenFood } from "../src/lib/nutrition/voice-food.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";

// Made-up foods and numbers.
function food(id: string, name: string, over: Partial<Food> = {}): Food {
  const n = emptyNutrients();
  n.energy = complete(100);
  return {
    id, name, brand: null, barcode: null, liquid: false, servingAmount: null, packageAmount: null,
    nutrients: n, source: "user", sourceId: null, sourceUrl: null, note: null, archived: false, ...over,
  };
}
const strip = (items: ReturnType<typeof parseSpokenFood>) => items.map((i) => [i.quantity, i.unit, i.name, i.measure ?? null]);

test("parse: number words, 'and' split, measures", () => {
  assert.deepEqual(strip(parseSpokenFood("two eggs and a cup of rice")), [
    [2, null, "eggs", null],
    [1, null, "rice", "cup"],
  ]);
});

test("parse: units in words and glued digits, kilos and litres converted", () => {
  assert.deepEqual(strip(parseSpokenFood("200 grams chicken")), [[200, "g", "chicken", null]]);
  assert.deepEqual(strip(parseSpokenFood("150g of greek yogurt, 300 ml milk")), [
    [150, "g", "greek yogurt", null],
    [300, "ml", "milk", null],
  ]);
  assert.deepEqual(strip(parseSpokenFood("half a kilo of potatoes")), [[500, "g", "potatoes", null]]);
  assert.deepEqual(strip(parseSpokenFood("two scoops whey")), [[2, "serving", "whey", null]]);
  assert.deepEqual(strip(parseSpokenFood("3 oz salmon")), [[3, "oz", "salmon", null]]);
});

test("parse: fractions, 'and a half', compound numbers, filler", () => {
  assert.deepEqual(strip(parseSpokenFood("half a protein bar")), [[0.5, null, "protein bar", null]]);
  assert.deepEqual(strip(parseSpokenFood("I had one and a half bagels for breakfast")), [[1.5, null, "bagels", null]]);
  assert.deepEqual(strip(parseSpokenFood("two hundred and fifty grams of oats")), [[250, "g", "oats", null]]);
  assert.deepEqual(strip(parseSpokenFood("twenty five almonds")), [[25, null, "almonds", null]]);
  assert.deepEqual(strip(parseSpokenFood("1/2 avocado")), [[0.5, null, "avocado", null]]);
  assert.deepEqual(strip(parseSpokenFood("haddock")), [[1, null, "haddock", null]]);
});

test("parse: junk and silence give nothing", () => {
  assert.deepEqual(parseSpokenFood(""), []);
  assert.deepEqual(parseSpokenFood("um uh"), []);
  assert.deepEqual(parseSpokenFood("  ,, and  "), []);
  assert.deepEqual(parseSpokenFood("???"), []);
  assert.deepEqual(parseSpokenFood(42 as unknown as string), []);
});

test("matching prefers your own and recent foods; plurals match", () => {
  const offEgg = food("off-egg", "Egg", { source: "off", sourceId: "1" });
  const myEgg = food("my-egg", "Egg", { servingAmount: 50 });
  const eggSalad = food("salad", "Egg salad");
  const foods = [offEgg, eggSalad, myEgg];
  assert.equal(candidatesFor("eggs", foods, [])[0].id, "my-egg");
  // A recent food wins over an equally close one you haven't logged lately.
  assert.equal(candidatesFor("egg", foods, [{ foodId: "off-egg", quantity: 1, unit: "g" }])[0].id, "off-egg");
  const [m, miss] = matchFoods(parseSpokenFood("two eggs and kimchi"), foods, []);
  assert.equal(m.food?.id, "my-egg");
  assert.deepEqual(m.amount, { quantity: 2, unit: "serving" });
  assert.equal(miss.food, null);
  assert.equal(miss.item.name, "kimchi");
  // Archived foods are never offered.
  assert.deepEqual(candidatesFor("egg", [food("x", "Egg", { archived: true })], []), []);
});

test("amount: unit must fit the food; measures fall back to the last amount", () => {
  const rice = food("rice", "Rice");
  const milk = food("milk", "Milk", { liquid: true });
  assert.deepEqual(amountFor({ quantity: 200, unit: "g", name: "rice" }, rice, null), { quantity: 200, unit: "g" });
  assert.equal(amountFor({ quantity: 200, unit: "g", name: "milk" }, milk, null), null);
  assert.equal(amountFor({ quantity: 1, unit: null, name: "rice", measure: "cup" }, rice, null), null);
  assert.deepEqual(amountFor({ quantity: 1, unit: null, name: "rice", measure: "cup" }, rice, { foodId: "rice", quantity: 180, unit: "g" }), { quantity: 180, unit: "g" });
  assert.equal(amountFor({ quantity: 2, unit: null, name: "rice" }, rice, null), null);
});
