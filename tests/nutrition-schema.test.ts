import test from "node:test";
import assert from "node:assert/strict";
import { createSchemaGate, isMissingSchema, SCHEMA_CACHE_MS, SCHEMA_KEY, shapeOp } from "../src/lib/offline/nutrition-schema.ts";
import type { NOp } from "../src/lib/offline/nutrition-outbox.ts";

function rig(answer: () => { error: { message: string } | null } | Error) {
  const kv = new Map<string, unknown>();
  let clock = 1_000_000;
  let probes = 0;
  const gate = createSchemaGate({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    probe: async () => {
      probes++;
      const a = answer();
      if (a instanceof Error) throw a;
      return a;
    },
    now: () => clock,
  });
  return { gate, kv, probes: () => probes, tick: (ms: number) => (clock += ms) };
}

const MISSING = { error: { message: 'Could not find the table \'public.recipes\' in the schema cache' } };

test("a missing table is not ready, and the answer is remembered", async () => {
  const r = rig(() => MISSING);
  assert.equal(await r.gate.probeTable("recipes"), false);
  assert.equal(await r.gate.probeTable("recipes"), false);
  assert.equal(r.probes(), 1);
  assert.ok((r.kv.get(SCHEMA_KEY) as Record<string, unknown>)["recipes.id"]);
});

test("the remembered answer expires after the cache time", async () => {
  let ok = false;
  const r = rig(() => (ok ? { error: null } : MISSING));
  assert.equal(await r.gate.probeTable("recipes"), false);
  ok = true;
  r.tick(SCHEMA_CACHE_MS - 1);
  assert.equal(await r.gate.probeTable("recipes"), false);
  r.tick(2);
  assert.equal(await r.gate.probeTable("recipes"), true);
  assert.equal(r.probes(), 2);
});

test("offline or an unrelated error counts as not ready and is never remembered", async () => {
  const r = rig(() => new Error("Failed to fetch"));
  assert.equal(await r.gate.probeTable("recipes"), false);
  assert.equal(await r.gate.probeTable("recipes"), false);
  assert.equal(r.probes(), 2);
  const r2 = rig(() => ({ error: { message: "JWT expired" } }));
  assert.equal(await r2.gate.probeColumn("food_entries", "status"), false);
  assert.equal(r2.kv.get(SCHEMA_KEY), undefined);
});

test("forget clears remembered answers; the local test backend is always ready", async () => {
  const r = rig(() => MISSING);
  await r.gate.probeTable("recipes");
  await r.gate.forget();
  await r.gate.probeTable("recipes");
  assert.equal(r.probes(), 2);
  const mock = createSchemaGate({
    kv: { get: async () => undefined, set: async () => true },
    probe: async () => MISSING,
    alwaysReady: () => true,
  });
  assert.equal(await mock.probeTable("recipes"), true);
});

test("isMissingSchema recognises table and column errors", () => {
  assert.ok(isMissingSchema("Could not find the 'status' column of 'food_entries' in the schema cache"));
  assert.ok(isMissingSchema('relation "public.usuals" does not exist'));
  assert.ok(!isMissingSchema("violates check constraint"));
});

test("new columns are dropped from sent rows while the server lacks them", async () => {
  const missing = { probeColumn: async () => false };
  const ready = { probeColumn: async () => true };
  const insert: NOp = { kind: "insert", table: "food_entries", rows: [{ id: "e", status: "logged", name: "x" }] };
  assert.deepEqual(await shapeOp(missing, insert), { kind: "insert", table: "food_entries", rows: [{ id: "e", name: "x" }] });
  assert.deepEqual(await shapeOp(ready, insert), insert);
  const food: NOp = { kind: "update", table: "foods", ids: ["f"], patch: { name: "n", price_cents: 100, price_amount: 500 } };
  assert.deepEqual(await shapeOp(missing, food), { kind: "update", table: "foods", ids: ["f"], patch: { name: "n" } });
  // Changes that never touch a new column, and other tables, pass untouched.
  const plain: NOp = { kind: "update", table: "food_entries", ids: ["e"], patch: { note: "hi" } };
  assert.equal(await shapeOp(missing, plain), plain);
  const usual: NOp = { kind: "insert", table: "usuals", rows: [{ id: "u" }] };
  assert.equal(await shapeOp(missing, usual), usual);
});
