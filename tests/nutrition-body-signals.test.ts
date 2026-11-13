import test from "node:test";
import assert from "node:assert/strict";
import { caffeineAt, cutoffTime, sleepAtFor } from "../src/lib/nutrition/caffeine.ts";
import { eatingWindow, hoursSinceEaten, lastEatenBefore } from "../src/lib/nutrition/fasting.ts";
import { logToRow, rowToLog, waterMl, type NutritionLog } from "../src/lib/nutrition/hydration.ts";
import { dueNow, supplementStreak, takenToday } from "../src/lib/nutrition/supplements.ts";
import type { Supplement } from "../src/lib/nutrition/goals.ts";
import { makeQuickEntry } from "../src/lib/nutrition/entry-math.ts";
import { DEFAULT_MEALS } from "../src/lib/nutrition/day.ts";
import type { DiaryEntry } from "../src/lib/nutrition/diary-types.ts";
import { createNutritionStore } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

// Every amount below is made up for the test; the 5 h half-life is a fixed test setting.
const H = 3_600_000;
const T0 = new Date(2026, 10, 12, 8, 0);
const drink = (id: string, mg: number, at: Date, day = "2026-11-12", status: DiaryEntry["status"] = "logged"): DiaryEntry => ({
  ...makeQuickEntry({ name: id, values: { energy: 5, caffeine: mg / 1000 }, foodDay: day, meal: DEFAULT_MEALS[0], now: at, id }),
  status,
});
const log = (over: Partial<NutritionLog>): NutritionLog => ({
  id: Math.random().toString(36).slice(2),
  kind: "water",
  foodDay: "2026-11-12",
  amount: 250,
  ref: null,
  loggedAt: T0.toISOString(),
  ...over,
});

test("half-life math: 100 mg is 50 mg after one half-life, 25 after two", () => {
  const e = [drink("a", 100, T0)];
  assert.equal(Math.round(caffeineAt(e, T0, 5)), 100);
  assert.equal(Math.round(caffeineAt(e, new Date(T0.getTime() + 5 * H), 5)), 50);
  assert.equal(Math.round(caffeineAt(e, new Date(T0.getTime() + 10 * H), 5)), 25);
  assert.equal(caffeineAt(e, new Date(T0.getTime() - H), 5), 0);
});

test("two drinks add; a planned drink doesn't count", () => {
  const e = [drink("a", 100, T0), drink("b", 100, new Date(T0.getTime() + 5 * H)), drink("p", 400, T0, "2026-11-12", "planned")];
  assert.equal(Math.round(caffeineAt(e, new Date(T0.getTime() + 5 * H), 5)), 150);
});

test("cutoff: latest time another drink like the last stays under the user's threshold at sleep", () => {
  const sleep = new Date(T0.getTime() + 15 * H); // 23:00
  const e = [drink("a", 100, T0)]; // 12.5 mg left at sleep
  const c = cutoffTime(e, sleep, 62.5, 5);
  assert.equal(c.kind, "at");
  // Room 50 mg for a 100 mg drink: one half-life before sleep.
  assert.equal(c.kind === "at" && c.at.getTime(), sleep.getTime() - 5 * H);
  assert.deepEqual(cutoffTime([], sleep, 50, 5), { kind: "none" });
  assert.equal(cutoffTime(e, sleep, 10, 5).kind, "over");
  assert.equal(cutoffTime(e, sleep, 200, 5).kind, "free");
});

test("sleep time after a 19:00-07:30 night shift is 08:00 the next morning", () => {
  const shifts = [{ date: "2026-11-11", type: "night" as const, start: "19:00", end: "07:30" }];
  assert.deepEqual(sleepAtFor("2026-11-12", shifts, "23:00"), new Date(2026, 10, 12, 8, 0));
  // Off day: the user's own sleep time.
  assert.deepEqual(sleepAtFor("2026-11-13", shifts, "23:00"), new Date(2026, 10, 13, 23, 0));
  // An evening shift ending after it pushes sleep to end + 30 min.
  const eve = [{ date: "2026-11-13", type: "evening" as const, start: "15:00", end: "23:30" }];
  assert.deepEqual(sleepAtFor("2026-11-13", eve, "23:00"), new Date(2026, 10, 14, 0, 0));
  // A sleep time before noon means the next morning.
  assert.deepEqual(sleepAtFor("2026-11-13", [], "01:00"), new Date(2026, 10, 14, 1, 0));
});

test("fasting window works across midnight on a night shift", () => {
  const day = "2026-11-11";
  const e = [
    drink("dinner", 0, new Date(2026, 10, 11, 18, 0), day),
    drink("snack", 0, new Date(2026, 10, 12, 3, 0), day), // still food day the 11th
  ];
  const w = eatingWindow(e)!;
  assert.equal(w.hours, 9);
  const now = new Date(2026, 10, 12, 15, 0);
  assert.deepEqual(lastEatenBefore(now, e), new Date(2026, 10, 12, 3, 0));
  assert.equal(hoursSinceEaten(now, e), 12);
  assert.equal(eatingWindow([]), null);
  assert.equal(hoursSinceEaten(now, []), null);
});

const creatine: Supplement = { id: "s1", name: "Creatine", dose: "5 g", times: [] };
const fishOil: Supplement = { id: "s2", name: "Fish oil", dose: "", times: ["08:00", "20:00"] };

test("supplements: due doses and the streak, which breaks on a missed dose", () => {
  const take = (ref: string, day: string) => log({ kind: "supplement", ref, foodDay: day, amount: 1 });
  const logs = [
    take("s1", "2026-11-10"), take("s2", "2026-11-10"), take("s2", "2026-11-10"),
    take("s1", "2026-11-11"), take("s2", "2026-11-11"), take("s2", "2026-11-11"),
    take("s1", "2026-11-12"), take("s2", "2026-11-12"),
  ];
  const list = [creatine, fishOil];
  // Today is in progress (one fish oil dose left): the streak counts to yesterday.
  assert.equal(supplementStreak(list, logs, "2026-11-12"), 2);
  assert.equal(supplementStreak(list, [...logs, take("s2", "2026-11-12")], "2026-11-12"), 3);
  // Missed one dose on the 11th: the run stops there.
  const missed = logs.filter((l, i) => i !== 5);
  assert.equal(supplementStreak(list, missed, "2026-11-12"), 0);
  assert.equal(takenToday(fishOil, logs, "2026-11-12"), 1);
  assert.deepEqual(dueNow(list, logs, "2026-11-12", new Date(2026, 10, 12, 21, 0)).map((s) => s.id), ["s2"]);
  assert.deepEqual(dueNow(list, logs, "2026-11-12", new Date(2026, 10, 12, 9, 0)), []);
  assert.equal(supplementStreak([], logs, "2026-11-12"), 0);
});

test("water: logs count; drinks logged as food count only with the setting on", () => {
  const juice: DiaryEntry = {
    ...drink("juice", 0, T0),
    unit: "ml",
    grams: 300,
    food: { name: "Juice", brand: null, liquid: true, servingAmount: null, packageAmount: null, per100: drink("x", 0, T0).nutrients } as unknown as DiaryEntry["food"],
  };
  const logs = [log({}), log({ amount: 500 }), log({ foodDay: "2026-11-11" }), log({ kind: "supplement", ref: "s1", amount: 1 })];
  assert.equal(waterMl(logs, [juice], "2026-11-12", false), 750);
  assert.equal(waterMl(logs, [juice], "2026-11-12", true), 1050);
  assert.equal(waterMl(logs, [{ ...juice, status: "planned" }], "2026-11-12", true), 750);
});

test("a log row round-trips, and logs stay on the phone while the server lacks the table", async () => {
  const l = log({ amount: 330 });
  assert.deepEqual(rowToLog({ ...logToRow(l), amount: "330.00" }), l);

  const kv = new Map<string, unknown>();
  let box: unknown;
  const outbox = createNutritionOutbox({
    store: { get: async () => box, set: async (v) => ((box = v), true) },
    getDb: () => ({ from: () => ({}) }) as never,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => false,
  });
  let ready = false;
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async () => ({ data: null, error: { message: "offline" } }) },
    userId: async () => "u1",
    schema: { probeTable: async () => ready, probeColumn: async () => true },
  });
  const saved = await store.addLog(l);
  assert.equal(saved.localOnly, true);
  assert.equal(box, undefined);
  assert.deepEqual((await store.listLogs("2026-11-12")).map((x) => x.id), [l.id]);
  assert.deepEqual(await store.listLogs("2026-11-11"), []);
  ready = true;
  await store.listLogs();
  const ops = (box as unknown as { op: NOp }[]).map((e) => e.op);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].table, "nutrition_logs");
});
