import { test } from "node:test";
import assert from "node:assert/strict";
import * as staplesModule from "../src/lib/nutrition/staples.ts";
import { STAPLES, STAPLES_VERSION, stapleFoodsToSeed, validateSeed } from "../src/lib/nutrition/staples.ts";
import type { StapleSeed } from "../src/lib/nutrition/staples.ts";
import { complete, incomplete } from "../src/lib/nutrition/nutrients.ts";

// Clearly fake seeds, for the mechanism only.
const fake = (key: string, over: Partial<StapleSeed> = {}): StapleSeed => ({
  key, name: `Fake ${key}`, liquid: false, servingAmount: 30,
  per100: { energy: 111, protein: 1 }, sourceNote: "fake test seed", ...over,
});

let counter = 0;
const newId = () => `id-${++counter}`;

test("the shipped list is valid (and empty for now)", () => {
  assert.equal(STAPLES_VERSION, 1);
  const keys = new Set<string>();
  for (const s of STAPLES) {
    assert.equal(validateSeed(s, keys), null, s.key);
    keys.add(s.key);
  }
  assert.deepEqual(STAPLES, []);
  assert.deepEqual(stapleFoodsToSeed(STAPLES, [], newId), []);
});

test("an empty seed list gives no foods", () => {
  assert.deepEqual(stapleFoodsToSeed([], [], newId), []);
});

test("seeds create foods once", () => {
  const seeds = [fake("a"), fake("b", { liquid: true, servingAmount: undefined })];
  const first = stapleFoodsToSeed(seeds, [], newId);
  assert.equal(first.length, 2);
  assert.equal(first[0].source, "staple");
  assert.equal(first[0].sourceId, "a");
  assert.equal(first[0].note, "fake test seed");
  assert.equal(first[0].servingAmount, 30);
  assert.equal(first[1].servingAmount, null);
  assert.equal(first[1].liquid, true);
  assert.deepEqual(first[0].nutrients.energy, complete(111));
  assert.deepEqual(first[0].nutrients.fiber, incomplete());
  assert.deepEqual(stapleFoodsToSeed(seeds, first, newId), []);
  const more = stapleFoodsToSeed([...seeds, fake("c")], first, newId);
  assert.deepEqual(more.map((f) => f.sourceId), ["c"]);
});

test("invalid and duplicate seeds are skipped", () => {
  const seeds = [
    fake(""),
    fake("noenergy", { per100: { protein: 1 } }),
    fake("neg", { per100: { energy: -1 } }),
    fake("nan", { per100: { energy: NaN } }),
    fake("noname", { name: " " }),
    fake("nonote", { sourceNote: "" }),
    fake("badserving", { servingAmount: 0 }),
    fake("good"),
    fake("good"),
  ];
  const out = stapleFoodsToSeed(seeds, [], newId);
  assert.deepEqual(out.map((f) => f.sourceId), ["good"]);
  assert.ok(validateSeed(fake("x", { per100: { energy: 1, bogus: 2 } as never })));
});

test("fake seeds never reach an exported list", () => {
  stapleFoodsToSeed([fake("leak")], [], newId);
  assert.equal(STAPLES.length, 0);
  for (const value of Object.values(staplesModule)) {
    if (Array.isArray(value)) assert.equal(JSON.stringify(value).includes("leak"), false);
  }
});
