import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, rank, score } from "../src/lib/search.ts";

test("normalize drops case, accents and punctuation", () => {
  assert.equal(normalize("  Pull-Up (Wide) "), "pull up wide");
  assert.equal(normalize("Café"), "cafe");
});

test("every word has to match somewhere", () => {
  assert.ok(score("bench incline", ["Incline Bench Press"]) > 0);
  assert.equal(score("bench squat", ["Incline Bench Press"]), 0);
  assert.equal(score("", ["Anything"]), 0);
});

test("aliases and other fields count", () => {
  assert.ok(score("rdl", ["Romanian Deadlift", "RDL"]) > 0);
  assert.ok(score("pullup", ["Pull-Up"]) > 0);
});

test("names that start with the query rank first", () => {
  const items = ["Close-Grip Bench Press", "Bench Press", "Dumbbell Bench Press", "Bench Dip"];
  assert.deepEqual(rank("bench", items, (x) => [x]), ["Bench Press", "Bench Dip", "Close-Grip Bench Press", "Dumbbell Bench Press"]);
  assert.deepEqual(rank("bench press", items, (x) => [x])[0], "Bench Press");
});
