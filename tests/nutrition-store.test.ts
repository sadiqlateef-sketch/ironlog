import test from "node:test";
import assert from "node:assert/strict";
import { createNutritionStore, MAX_RECENTS, type ReadQuery, type StoreDeps } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";
import { STAPLES } from "../src/lib/nutrition/staples.ts";
import { complete, emptyNutrients } from "../src/lib/nutrition/nutrients.ts";
import { makeEntry, makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import { foodToRow, type Food } from "../src/lib/nutrition/diary-types.ts";

// Everything below is a made-up food with made-up numbers.
function fakeFood(over: Partial<Food> = {}): Food {
  const n = emptyNutrients();
  n.energy = complete(200);
  n.protein = complete(10);
  return {
    id: "food-1",
    name: "Test oats",
    brand: null,
    barcode: null,
    liquid: false,
    servingAmount: 40,
    packageAmount: null,
    nutrients: n,
    source: "user",
    sourceId: null,
    sourceUrl: null,
    note: null,
    archived: false,
    ...over,
  };
}
const meal = DEFAULT_MEALS[0];
const NOW = new Date("2026-11-12T08:00:00Z");
const DAY = "2026-11-12";

function rig(opts: { serverDays?: Record<string, unknown[]>; serverFoods?: Food[]; staples?: StoreDeps["staples"] } = {}) {
  const kv = new Map<string, unknown>();
  const outboxState = { value: undefined as unknown };
  const serverDays = opts.serverDays ?? {};
  const db: DbLike = {
    from: () => ({
      upsert: async () => ({ error: null }),
      update: () => ({ in: async () => ({ error: null }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  let online = false;
  const outbox = createNutritionOutbox({
    store: { get: async () => outboxState.value, set: async (v) => ((outboxState.value = v), true) },
    getDb: () => db,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => online,
  });
  let n = 0;
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: {
      read: async (q: ReadQuery) => {
        if (!online) return { data: null, error: { message: "Failed to fetch" } };
        if (q.table === "food_entries") return { data: serverDays[String(q.eq?.food_day)] ?? [], error: null };
        if (q.table === "foods" && opts.serverFoods) {
          const rows = opts.serverFoods.map(foodToRow).filter((row) =>
            Object.entries(q.eq ?? {}).every(([k, v]) => (row as Record<string, unknown>)[k] === v),
          );
          return { data: rows, error: null };
        }
        return { data: q.single ? null : [], error: null };
      },
    },
    userId: async () => "user-1",
    now: () => NOW,
    newId: () => `id-${++n}`,
    staples: opts.staples,
  });
  const ops = () => ((outboxState.value as { op: NOp }[]) ?? []).map((e) => e.op);
  return { kv, store, outbox, ops, setOnline: (v: boolean) => (online = v) };
}

test("an entry added offline shows in listDay at once and is queued", async () => {
  const r = rig();
  const e = makeEntry({ food: fakeFood(), quantity: 50, unit: "g", foodDay: DAY, meal, now: NOW, id: "e1" });
  await r.store.addEntry(e);
  assert.deepEqual((await r.store.listDay(DAY)).map((x) => x.id), ["e1"]);
  assert.equal(await r.outbox.pendingCount(), 1);
});

test("kv is truth while pending; server rows win once the outbox is empty", async () => {
  const serverRow = {
    id: "srv", food_day: DAY, meal_id: "m", meal_name: "Lunch", eaten_at: NOW.toISOString(), food_id: null, name: "From server",
    brand: null, quantity: "1.000", unit: "quick", grams: null, food: null, nutrients: emptyNutrients(), note: null,
  };
  const r = rig({ serverDays: { [DAY]: [serverRow] } });
  await r.store.addEntry(makeQuickEntry({ name: "Local", values: { energy: 100 }, foodDay: DAY, meal, now: NOW, id: "loc" }));
  r.setOnline(true);
  assert.deepEqual((await r.store.listDay(DAY)).map((e) => e.id), ["loc"]);
  await r.outbox.flush();
  assert.equal(await r.outbox.hasPending(), false);
  const after = await r.store.listDay(DAY);
  assert.deepEqual(after.map((e) => e.id), ["srv"]);
  assert.equal(after[0].quantity, 1);
  // The phone copy was rewritten, so going offline falls back to it.
  r.setOnline(false);
  assert.deepEqual((await r.store.listDay(DAY)).map((e) => e.id), ["srv"]);
});

test("a failed read never blanks the screen", async () => {
  const r = rig();
  r.kv.set(`nutrition-day:${DAY}`, [{ id: "kept" }]);
  assert.deepEqual((await r.store.listDay(DAY)).map((e) => e.id), ["kept"]);
});

test("recents: newest first, distinct, capped", async () => {
  const r = rig();
  for (let i = 0; i < MAX_RECENTS + 5; i++) {
    await r.store.addEntry(makeEntry({ food: fakeFood({ id: `f${i}`, name: `Food ${i}` }), quantity: 10, unit: "g", foodDay: DAY, meal, now: NOW, id: `e${i}` }));
  }
  await r.store.addEntry(makeEntry({ food: fakeFood({ id: "f10", name: "Food 10" }), quantity: 77, unit: "g", foodDay: DAY, meal, now: NOW, id: "again" }));
  const rec = await r.store.listRecents();
  assert.equal(rec.length, MAX_RECENTS);
  assert.equal(rec[0].foodId, "f10");
  assert.equal(rec[0].quantity, 77);
  assert.equal(rec.filter((x) => x.foodId === "f10").length, 1);
  assert.equal(rec[1].foodId, `f${MAX_RECENTS + 4}`);
});

test("saveFood dedupes by source and sourceId", async () => {
  const r = rig();
  const a = await r.store.saveFood(fakeFood({ id: "a", source: "off", sourceId: "123" }));
  const b = await r.store.saveFood(fakeFood({ id: "b", source: "off", sourceId: "123" }));
  assert.equal(b.id, a.id);
  assert.equal((await r.store.listFoods()).length, 1);
  assert.equal(await r.outbox.pendingCount(), 1);
  const c = await r.store.saveFood(fakeFood({ id: "c", source: "usda", sourceId: "123" }));
  assert.equal(c.id, "c");
});

test("updateEntry quantity change recomputes from the snapshot, not the live food", async () => {
  const r = rig();
  const food = fakeFood();
  await r.store.addEntry(makeEntry({ food, quantity: 100, unit: "g", foodDay: DAY, meal, now: NOW, id: "e1" }));
  await r.store.saveFood({ ...food, nutrients: { ...food.nutrients, energy: complete(9999) } });
  const up = await r.store.updateEntry("e1", { quantity: 50 }, DAY);
  assert.equal(up?.nutrients.energy.value, 100);
  assert.equal((await r.store.listDay(DAY))[0].grams, 50);
  const last = r.ops().at(-1)!;
  assert.equal(last.kind, "update");
  assert.deepEqual(Object.keys((last as { patch: object }).patch).sort(), ["grams", "nutrients", "quantity"]);
});

test("moving an entry to another meal, then deleting it", async () => {
  const r = rig();
  await r.store.addEntry(makeQuickEntry({ name: "Snack", values: { energy: 50 }, foodDay: DAY, meal, now: NOW, id: "q" }));
  await r.store.updateEntry("q", { mealId: "meal-lunch", mealName: "Lunch" }, DAY);
  assert.equal((await r.store.listDay(DAY))[0].mealName, "Lunch");
  await r.store.deleteEntry("q", DAY);
  assert.deepEqual(await r.store.listDay(DAY), []);
});

test("ensureStaples with fake seeds inserts once and bumps staples_version", async () => {
  const seeds = [{ key: "fake-a", name: "Fake A", liquid: false, per100: { energy: 1 }, sourceNote: "test" }];
  const r = rig({ staples: { list: seeds, version: 3 } });
  await r.store.ensureStaples();
  await r.store.ensureStaples();
  const foods = await r.store.listFoods();
  assert.equal(foods.length, 1);
  assert.equal(foods[0].source, "staple");
  const ops = r.ops();
  assert.deepEqual(ops.map((o) => `${o.table}:${o.kind}`), ["foods:insert", "users:update"]);
  assert.equal((await r.store.loadPrefs()).staples_version, 3);
});

test("the real STAPLES list is empty, so ensureStaples does nothing", async () => {
  assert.equal(STAPLES.length, 0);
  const r = rig();
  await r.store.ensureStaples();
  assert.equal(await r.outbox.pendingCount(), 0);
  assert.equal(r.kv.size, 0);
});

test("prefs: save is queued as a users update; load returns normalized prefs", async () => {
  const r = rig();
  const saved = await r.store.savePrefs({ day_start: "04:00", meals: [], staples_version: 0 });
  assert.equal(saved.day_start, "04:00");
  assert.equal(saved.meals.length, 4);
  assert.equal((await r.store.loadPrefs()).day_start, "04:00");
  const op = r.ops()[0];
  assert.equal(op.kind, "update");
  assert.deepEqual((op as { ids: string[] }).ids, ["user-1"]);
});

// N3.4: a pending food filled in from a product that is saved only on the server.
test("findFoodBySource finds a food that is only on the server and keeps a phone copy", async () => {
  const onServer = fakeFood({ id: "srv-off", source: "off", sourceId: "fake-77" });
  const r = rig({ serverFoods: [onServer] });
  // The phone already has its own (capped) list, without the server's OFF food.
  await r.store.saveFood(fakeFood({ id: "mine" }));
  r.setOnline(true);
  const found = await r.store.findFoodBySource("off", "fake-77", "pending-1");
  assert.equal(found?.id, "srv-off");
  r.setOnline(false);
  // Now answered from the phone, with no server.
  assert.equal((await r.store.findFoodBySource("off", "fake-77", "pending-1"))?.id, "srv-off");
});

test("findFoodBySource: none is null, offline is unknown, the food itself is ignored", async () => {
  const self = fakeFood({ id: "p1", source: "off", sourceId: "fake-88" });
  const r = rig({ serverFoods: [self] });
  r.setOnline(true);
  assert.equal(await r.store.findFoodBySource("off", "fake-88", "p1"), null);
  assert.equal(await r.store.findFoodBySource("off", "fake-99", "p1"), null);
  r.setOnline(false);
  assert.equal(await r.store.findFoodBySource("off", "fake-99", "p1"), undefined);
  await r.store.saveFood(fakeFood({ id: "local-off", source: "off", sourceId: "fake-99" }));
  assert.equal((await r.store.findFoodBySource("off", "fake-99", "p1"))?.id, "local-off");
});
