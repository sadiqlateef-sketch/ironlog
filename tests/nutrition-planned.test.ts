import test from "node:test";
import assert from "node:assert/strict";
import { confirm, plannedFor } from "../src/lib/nutrition/planned.ts";
import { dayTotals, makeQuickEntry, plannedTotals } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS, foodDay } from "../src/lib/nutrition/day.ts";
import type { DiaryEntry } from "../src/lib/nutrition/diary-types.ts";
import { createNutritionStore } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

const meal = DEFAULT_MEALS[2];
const planned = (id: string, day: string, kcal: number): DiaryEntry => ({
  ...makeQuickEntry({ name: "Dinner out", values: { energy: kcal }, foodDay: day, meal, now: new Date(2026, 10, 12, 8), id }),
  status: "planned",
});

test("a planned entry is left out of totals until confirmed, then counted", () => {
  const p = planned("p1", "2026-11-12", 700);
  assert.equal(dayTotals([p]).energy.value, 0);
  assert.equal(plannedTotals([p]).energy.value, 700);
  const done = confirm(p, new Date(2026, 10, 12, 19, 30), "00:00");
  assert.equal(done.status, "logged");
  assert.equal(dayTotals([done]).energy.value, 700);
  assert.equal(plannedTotals([done]).energy.value, 0);
});

test("confirming moves the entry to the food day it was eaten on, stamped now", () => {
  const p = planned("p1", "2026-11-10", 500);
  const now = new Date(2026, 10, 12, 2, 0);
  const done = confirm(p, now, "04:00");
  // 02:00 with a 04:00 day start still belongs to the 11th.
  assert.equal(done.foodDay, foodDay(now, "04:00"));
  assert.equal(done.foodDay, "2026-11-11");
  assert.equal(done.eatenAt, now.toISOString());
});

test("plannedFor lists only that day's planned entries", () => {
  const eaten = { ...planned("e", "2026-11-12", 1), status: "logged" as const };
  assert.deepEqual(plannedFor([eaten, planned("a", "2026-11-12", 1), planned("b", "2026-11-13", 1)], "2026-11-12").map((e) => e.id), ["a"]);
});

test("confirming in the store sends the status and the move as one update", async () => {
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
  const now = new Date(2026, 10, 13, 9, 0);
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async () => ({ data: null, error: { message: "Failed to fetch" } }) },
    userId: async () => "u",
    now: () => now,
  });
  const p = planned("p1", "2026-11-12", 600);
  await store.addEntry(p);
  const done = await store.confirmPlanned(p, "00:00");
  assert.equal(done?.foodDay, "2026-11-13");
  assert.deepEqual(await store.listDay("2026-11-12"), []);
  assert.equal((await store.listDay("2026-11-13"))[0].status, "logged");
  const op = ((box.value as { op: NOp }[]) ?? []).map((x) => x.op)[1] as Extract<NOp, { kind: "update" }>;
  assert.deepEqual(Object.keys(op.patch).sort(), ["eaten_at", "food_day", "status"]);
  assert.equal(await store.canPlan(), true);
});
