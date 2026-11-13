import test from "node:test";
import assert from "node:assert/strict";
import { entriesFromUsual, isOnShift, rankUsuals, rowToUsual, usualFromMeal, usualToRow, type Usual } from "../src/lib/nutrition/usuals.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { makeEntry, makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { Food } from "../src/lib/nutrition/diary-types.ts";
import { createNutritionStore } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

// Made-up food, places and numbers.
const n = emptyNutrients();
n.energy = complete(100);
const FOOD: Food = { id: "f1", name: "Test wrap", brand: null, barcode: null, liquid: false, servingAmount: 80, packageAmount: null, nutrients: n, source: "user", sourceId: null, sourceUrl: null, note: null, archived: false };
const meal = DEFAULT_MEALS[1];
const T0 = new Date("2026-11-12T12:00:00Z");

function usual(over: Partial<Usual>): Usual {
  return { id: "u", name: "U", place: null, mealId: null, items: [], useCount: 0, lastUsedAt: null, ...over };
}

test("a meal saved as a usual logs back as fresh entries with the same totals", () => {
  const a = makeEntry({ food: FOOD, quantity: 2, unit: "serving", foodDay: "2026-11-11", meal, now: T0, id: "a" });
  const b = makeQuickEntry({ name: "Coffee", values: { energy: 5 }, foodDay: "2026-11-11", meal, now: new Date(T0.getTime() + 1), id: "b" });
  const u = usualFromMeal([b, a], " Lunch wrap ", "work", "u1", meal.id);
  assert.equal(u.name, "Lunch wrap");
  assert.deepEqual(u.items.map((i) => i.name), ["Test wrap", "Coffee"]);
  let k = 0;
  const out = entriesFromUsual(u, "2026-11-12", DEFAULT_MEALS[0], T0, () => `n${++k}`);
  assert.deepEqual(out.map((e) => e.id), ["n1", "n2"]);
  assert.deepEqual(out.map((e) => [e.foodDay, e.mealId, e.status]), [["2026-11-12", DEFAULT_MEALS[0].id, "logged"], ["2026-11-12", DEFAULT_MEALS[0].id, "logged"]]);
  assert.equal(out[0].nutrients.energy.value, 160);
  assert.equal(out[1].nutrients.energy.value, 5);
  assert.notEqual(out[0].eatenAt, out[1].eatenAt);
  assert.deepEqual(rowToUsual(usualToRow(u)), u);
  assert.equal(entriesFromUsual(u, "d", meal, T0, () => "x", "planned")[0].status, "planned");
});

test("without location: most used first, then most recent", () => {
  const list = [
    usual({ id: "a", name: "A", useCount: 1, lastUsedAt: "2026-11-10T00:00:00Z" }),
    usual({ id: "b", name: "B", useCount: 3 }),
    usual({ id: "c", name: "C", useCount: 1, lastUsedAt: "2026-11-11T00:00:00Z" }),
    usual({ id: "w", name: "W", place: "work" }),
  ];
  assert.deepEqual(rankUsuals(list, { places: [], now: T0, onShift: false }).map((u) => u.id), ["b", "c", "a", "w"]);
  // On shift, work usuals go first with no location needed.
  assert.deepEqual(rankUsuals(list, { places: [], now: T0, onShift: true }).map((u) => u.id), ["w", "b", "c", "a"]);
});

test("with location: a usual saved for a place within 300 m goes first", () => {
  const places = [
    { name: "Cafe", lat: 10, lng: 10 },
    { name: "Far", lat: 20, lng: 20 },
  ];
  const list = [usual({ id: "b", name: "B", useCount: 9 }), usual({ id: "far", place: "Far" }), usual({ id: "cafe", place: "cafe" })];
  const here = { lat: 10.001, lng: 10 }; // about 111 m north of Cafe
  assert.deepEqual(rankUsuals(list, { here, places, now: T0, onShift: false }).map((u) => u.id), ["cafe", "b", "far"]);
  const away = { lat: 10.01, lng: 10 }; // about 1.1 km
  assert.equal(rankUsuals(list, { here: away, places, now: T0, onShift: false })[0].id, "b");
});

test("on shift: inside a night shift that runs past midnight", () => {
  const night = [{ date: "2026-11-12", start: "19:00", end: "07:30" }];
  assert.equal(isOnShift(new Date(2026, 10, 13, 3, 0), night), true);
  assert.equal(isOnShift(new Date(2026, 10, 13, 8, 0), night), false);
  assert.equal(isOnShift(new Date(2026, 10, 12, 18, 59), night), false);
});

test("logging a usual queues the entries and the use count together", async () => {
  const kv = new Map<string, unknown>();
  const box = { value: undefined as unknown };
  const db: DbLike = {
    from: () => ({
      upsert: async () => ({ error: null }),
      update: () => ({ in: async () => ({ error: null }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  const outbox = createNutritionOutbox({
    store: { get: async () => box.value, set: async (v) => ((box.value = v), true) },
    getDb: () => db,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => false,
  });
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async () => ({ data: null, error: { message: "Failed to fetch" } }) },
    userId: async () => "u",
    now: () => T0,
  });
  const a = makeEntry({ food: FOOD, quantity: 1, unit: "serving", foodDay: "2026-11-11", meal, now: T0, id: "a" });
  const u = usualFromMeal([a], "Wrap", null, "u1");
  await store.saveUsual(u);
  await store.logUsual("u1", entriesFromUsual(u, "2026-11-12", meal, T0, () => "e1"));
  const ops = ((box.value as { op: NOp }[]) ?? []).map((x) => x.op);
  assert.deepEqual(ops.map((o) => [o.kind, o.table]), [["insert", "usuals"], ["insert", "food_entries"], ["update", "usuals"]]);
  assert.equal((ops[2] as Extract<NOp, { kind: "update" }>).patch.use_count, 1);
  assert.equal((await store.listDay("2026-11-12")).length, 1);
});
