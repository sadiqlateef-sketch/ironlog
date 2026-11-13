import test from "node:test";
import assert from "node:assert/strict";
import { createNutritionStore, touchedBy, type ReadQuery } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";
import { createCollection } from "../src/lib/offline/nutrition-collections.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { dayTotals, makeEntry, makeQuickEntry, mealTotals, plannedTotals } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import { entryToRow, rowToEntry, type Food } from "../src/lib/nutrition/diary-types.ts";

// Made-up items with made-up numbers.
interface Thing {
  id: string;
  name: string;
}

function rig(opts: { ready?: boolean; server?: Record<string, unknown>[] } = {}) {
  const kv = new Map<string, unknown>();
  const outboxState = { value: undefined as unknown };
  let ready = opts.ready ?? true;
  let online = false;
  let server = opts.server ?? [];
  const db: DbLike = {
    from: () => ({
      upsert: async () => ({ error: null }),
      update: () => ({ in: async () => ({ error: null }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  const outbox = createNutritionOutbox({
    store: { get: async () => outboxState.value, set: async (v) => ((outboxState.value = v), true) },
    getDb: () => db,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => online,
  });
  const reads: ReadQuery[] = [];
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: {
      read: async (q) => {
        reads.push(q);
        if (!online) return { data: null, error: { message: "Failed to fetch" } };
        if (q.table === "usuals") return { data: server, error: null };
        return { data: q.single ? null : [], error: null };
      },
    },
    userId: async () => "user-1",
    schema: { probeTable: async () => ready, probeColumn: async () => ready },
  });
  const things = createCollection<Thing>(
    {
      table: "usuals",
      kvKey: "nutrition-things",
      toRow: (t) => ({ id: t.id, name: t.name }),
      fromRow: (r) => ({ id: String(r.id), name: String(r.name) }),
    },
    store.internals,
  );
  const ops = () => ((outboxState.value as { op: NOp }[]) ?? []).map((e) => e.op);
  return {
    kv,
    store,
    things,
    outbox,
    ops,
    reads,
    setReady: (v: boolean) => (ready = v),
    setOnline: (v: boolean) => (online = v),
    setServer: (rows: Record<string, unknown>[]) => (server = rows),
  };
}

test("save mirrors the item to the phone and queues exactly one insert", async () => {
  const r = rig();
  await r.things.save({ id: "t1", name: "Oats bowl" });
  assert.deepEqual(r.kv.get("nutrition-things"), [{ id: "t1", name: "Oats bowl" }]);
  assert.deepEqual(r.ops(), [{ kind: "insert", table: "usuals", rows: [{ id: "t1", name: "Oats bowl" }] }]);
});

test("saving a synced item again queues an update; remove queues a delete and takes it off the phone", async () => {
  const r = rig();
  await r.things.save({ id: "t1", name: "A" });
  await r.things.save({ id: "t1", name: "B" });
  await r.things.remove("t1");
  assert.deepEqual(r.ops().slice(1), [
    { kind: "update", table: "usuals", ids: ["t1"], patch: { name: "B" } },
    { kind: "delete", table: "usuals", ids: ["t1"] },
  ]);
  assert.deepEqual(r.kv.get("nutrition-things"), []);
});

test("while changes are waiting the phone's list wins over the server", async () => {
  const r = rig({ server: [{ id: "s1", name: "Server" }] });
  await r.things.save({ id: "t1", name: "Phone" });
  r.setOnline(true);
  assert.deepEqual((await r.things.list()).map((t) => t.id), ["t1"]);
});

test("with nothing waiting the server list replaces the phone's", async () => {
  const r = rig({ server: [{ id: "s1", name: "Server" }] });
  r.setOnline(true);
  assert.deepEqual(await r.things.list(), [{ id: "s1", name: "Server" }]);
  assert.deepEqual(r.kv.get("nutrition-things"), [{ id: "s1", name: "Server" }]);
});

test("discarding waiting changes reloads the collections they touched", async () => {
  const r = rig({ server: [] });
  await r.things.save({ id: "t1", name: "Dropped" });
  r.setOnline(true);
  r.setServer([{ id: "s1", name: "Server" }]);
  assert.equal(await r.store.discardWaiting(), 1);
  assert.deepEqual(r.kv.get("nutrition-things"), [{ id: "s1", name: "Server" }]);
});

test("discard while offline at least drops the items the dropped changes added", async () => {
  const r = rig();
  await r.things.save({ id: "t1", name: "Dropped" });
  await r.store.discardWaiting();
  assert.deepEqual(r.kv.get("nutrition-things"), []);
});

test("touchedBy reports kitchen tables with the ids their inserts added", () => {
  const t = touchedBy([
    { kind: "insert", table: "recipes", rows: [{ id: "r1" }] },
    { kind: "update", table: "batches", ids: ["b1"], patch: { portions_left: 1 } },
  ]);
  assert.deepEqual([...(t.collections.get("recipes") ?? [])], ["r1"]);
  assert.deepEqual([...(t.collections.get("batches") ?? [])], []);
  assert.equal(t.foods, false);
  assert.equal(t.days.size, 0);
});

test("schema gate: a missing table means no queued change and a phone-only item", async () => {
  const r = rig({ ready: false });
  const saved = await r.things.save({ id: "t1", name: "Later" });
  assert.equal(saved.localOnly, true);
  assert.deepEqual(r.ops(), []);
  assert.deepEqual(await r.things.list(), [{ id: "t1", name: "Later", localOnly: true }]);
  // Removing a phone-only item queues nothing either.
  await r.things.remove("t1");
  assert.deepEqual(r.ops(), []);
});

test("schema gate: phone-only items are sent once the table is there, exactly once", async () => {
  const r = rig({ ready: false });
  await r.things.save({ id: "t1", name: "Later" });
  r.setReady(true);
  assert.equal(await r.things.promoteLocal(), 1);
  assert.equal(await r.things.promoteLocal(), 0);
  assert.deepEqual(r.ops(), [{ kind: "insert", table: "usuals", rows: [{ id: "t1", name: "Later" }] }]);
  assert.deepEqual(r.kv.get("nutrition-things"), [{ id: "t1", name: "Later" }]);
});

test("schema gate: list() promotes phone-only items when the table appears", async () => {
  const r = rig({ ready: false });
  await r.things.save({ id: "t1", name: "Later" });
  r.setReady(true);
  await r.things.list();
  assert.equal(r.ops().length, 1);
});

test("staged saves from two collections commit as one change set", async () => {
  const r = rig();
  const { locked, commit } = r.store.internals;
  await locked(async () => {
    const a = await r.things.stageSave({ id: "t1", name: "A" }, true);
    const b = await r.things.stageSave({ id: "t2", name: "B" }, true);
    await commit(...a, ...b);
  });
  assert.equal(r.ops().length, 2);
  assert.equal(await r.outbox.pendingCount(), 2);
});

// ---------- Entry status ----------

const n = emptyNutrients();
n.energy = complete(100);
n.protein = complete(10);
const food: Food = {
  id: "f1",
  name: "Test food",
  brand: null,
  barcode: null,
  liquid: false,
  servingAmount: 50,
  packageAmount: null,
  nutrients: n,
  source: "user",
  sourceId: null,
  sourceUrl: null,
  note: null,
  archived: false,
};
const meal = DEFAULT_MEALS[0];
const NOW = new Date("2026-11-12T08:00:00Z");

test("rows saved before planning existed read as logged", () => {
  const e = makeEntry({ food, quantity: 100, unit: "g", foodDay: "2026-11-12", meal, now: NOW, id: "e1" });
  const { status: _s, ...old } = entryToRow(e);
  void _s;
  const back = rowToEntry({ ...old, user_id: "u", created_at: "t", updated_at: "t" } as Parameters<typeof rowToEntry>[0]);
  assert.equal(back.status, "logged");
});

test("day and meal totals skip planned entries; plannedTotals counts only them", () => {
  const eaten = makeEntry({ food, quantity: 100, unit: "g", foodDay: "d", meal, now: NOW, id: "a" });
  const planned = { ...makeQuickEntry({ name: "Later", values: { energy: 500 }, foodDay: "d", meal, now: NOW, id: "b" }), status: "planned" as const };
  assert.equal(dayTotals([eaten, planned]).energy.value, 100);
  assert.equal(mealTotals([eaten, planned]).energy.value, 100);
  assert.equal(plannedTotals([eaten, planned]).energy.value, 500);
  // An entry without a status (older phone copy) counts as eaten.
  const { status: _st, ...legacy } = eaten;
  void _st;
  assert.equal(dayTotals([legacy]).energy.value, 100);
});
