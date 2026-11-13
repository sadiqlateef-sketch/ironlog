import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_HALF_LIFE_H,
  emptyGoals,
  macroGrams,
  normalizeGoals,
  percentProblem,
  resolveDayGoal,
  STARTER_BASE,
  type NutritionGoals,
} from "../src/lib/nutrition/goals.ts";
import { isTrainingDay, trainingDay } from "../src/lib/nutrition/training-day.ts";
import { phaseFor } from "../src/lib/nutrition/phase-goal.ts";
import { createNutritionStore, touchedBy } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type NOp } from "../src/lib/offline/nutrition-outbox.ts";

// All goal numbers below are made-up test settings, not advice.
const MON = "2026-11-09"; // a Monday
const SAT = "2026-11-14"; // a Saturday

function goals(over: Partial<NutritionGoals> = {}): NutritionGoals {
  return { ...emptyGoals(), base: { energy: 2400, mode: "grams", protein: 150, carbs: 280, fat: 70 }, ...over };
}

test("unset goals resolve to null everywhere", () => {
  const g = normalizeGoals(undefined);
  assert.equal(g.base, null);
  assert.equal(resolveDayGoal(g, MON, { training: true, phaseMode: "bulk" }), null);
  assert.deepEqual(normalizeGoals({ base: { energy: "lots" }, micros: { fiber: -1 }, junk: 1 }), emptyGoals());
  assert.equal(g.caffeine.halfLifeH, DEFAULT_HALF_LIFE_H);
  assert.equal(g.caffeine.thresholdMg, null);
  assert.equal(g.banking.on, false);
});

test("percent goals convert at 4/4/9 kcal per gram; grams pass through", () => {
  assert.deepEqual(macroGrams(STARTER_BASE), { energy: 2000, protein: 100, carbs: 250, fat: 66.7 });
  assert.deepEqual(macroGrams({ energy: 1800, mode: "grams", protein: 140, carbs: 180, fat: 60 }), {
    energy: 1800, protein: 140, carbs: 180, fat: 60,
  });
  assert.equal(percentProblem(STARTER_BASE), null);
  assert.equal(percentProblem({ ...STARTER_BASE, fat: 40 }), 110);
});

test("F1: a training day adds the training delta; a rest day doesn't", () => {
  const g = goals({ training: { energyDelta: 300, carbsDelta: 60, proteinDelta: 0 } });
  const rest = resolveDayGoal(g, MON, { training: false })!;
  const train = resolveDayGoal(g, MON, { training: true })!;
  assert.equal(rest.energy, 2400);
  assert.equal(train.energy, 2700);
  assert.equal(train.carbs, 340);
  assert.equal(train.protein, 150);
  assert.equal(train.training, true);
});

test("a weekday override replaces only what it sets", () => {
  const g = goals({ weekdays: { 6: { energy: 2800 } } });
  const sat = resolveDayGoal(g, SAT)!;
  assert.equal(sat.energy, 2800);
  assert.equal(sat.protein, 150);
  assert.equal(sat.weekdayOverride, true);
  assert.equal(resolveDayGoal(g, MON)!.energy, 2400);
  // Survives a save/load round trip.
  assert.equal(normalizeGoals(JSON.parse(JSON.stringify(g))).weekdays[6]?.energy, 2800);
});

test("F37: bulk and cut move energy, carbs and fat by the user's %; maintain and deload-as-maintain don't", () => {
  const g = goals({ phase: { byProgram: { p1: "bulk", p2: "cut" }, bulkPct: 10, cutPct: 20, deloadAsMaintain: true } });
  const bulk = resolveDayGoal(g, MON, { phaseMode: "bulk" })!;
  assert.equal(bulk.energy, 2640);
  assert.equal(bulk.carbs, 308);
  assert.equal(bulk.protein, 150);
  assert.equal(resolveDayGoal(g, MON, { phaseMode: "cut" })!.energy, 1920);
  assert.equal(resolveDayGoal(g, MON, { phaseMode: "maintain" })!.energy, 2400);
  const deload = resolveDayGoal(g, MON, { phaseMode: "bulk", deload: true })!;
  assert.equal(deload.energy, 2400);
  assert.equal(deload.phase, "maintain");
  const strict = { ...g, phase: { ...g.phase, deloadAsMaintain: false } };
  assert.equal(resolveDayGoal(strict, MON, { phaseMode: "bulk", deload: true })!.energy, 2640);
});

test("order: training delta is added before the phase percentage", () => {
  const g = goals({
    training: { energyDelta: 100, carbsDelta: 0, proteinDelta: 0 },
    phase: { byProgram: {}, bulkPct: 10, cutPct: 0, deloadAsMaintain: true },
  });
  assert.equal(resolveDayGoal(g, MON, { training: true, phaseMode: "bulk" })!.energy, 2750);
});

test("phaseFor reads the active program's phase and deload week", () => {
  const g = goals({ phase: { byProgram: { p1: "cut" }, bulkPct: 0, cutPct: 10, deloadAsMaintain: true } });
  assert.deepEqual(phaseFor(g, { program_id: "p1", next_is_deload: true }), { mode: "cut", deload: true, programId: "p1" });
  assert.deepEqual(phaseFor(g, { program_id: "other" }), { mode: null, deload: false, programId: "other" });
  assert.deepEqual(phaseFor(g, null), { mode: null, deload: false, programId: null });
});

test("training day: override wins, then a logged session, then the plan", () => {
  assert.equal(isTrainingDay({ sessionsOnDay: 0 }), false);
  assert.equal(isTrainingDay({ sessionsOnDay: 1 }), true);
  assert.equal(isTrainingDay({ sessionsOnDay: 0, plannedSlot: true }), true);
  assert.deepEqual(trainingDay({ sessionsOnDay: 2, override: "rest" }), { training: false, reason: "override" });
  assert.deepEqual(trainingDay({ sessionsOnDay: 0, override: "training" }), { training: true, reason: "override" });
});

test("supplements and caffeine settings are cleaned on load", () => {
  const g = normalizeGoals({
    caffeine: { halfLifeH: 6, sleepAt: "25:00", thresholdMg: 50 },
    supplements: [{ id: "s1", name: " Creatine ", dose: "5 g", times: ["08:00", "bad", "08:00"] }, { id: "", name: "x" }],
  });
  assert.deepEqual(g.caffeine, { halfLifeH: 6, sleepAt: "23:00", thresholdMg: 50 });
  assert.deepEqual(g.supplements, [{ id: "s1", name: "Creatine", dose: "5 g", times: ["08:00"] }]);
});

test("saveGoals keeps goals on the phone and queues one users update; touchedBy tells goals from prefs", async () => {
  const kv = new Map<string, unknown>();
  let box: unknown;
  const outbox = createNutritionOutbox({
    store: { get: async () => box, set: async (v) => ((box = v), true) },
    getDb: () => ({ from: () => ({}) }) as never,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => false,
  });
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async () => ({ data: null, error: { message: "offline" } }) },
    userId: async () => "u1",
  });
  assert.equal((await store.loadGoals()).base, null);
  await store.saveGoals(goals());
  assert.equal((await store.loadGoals()).base?.energy, 2400);
  const ops = (box as { op: NOp }[]).map((e) => e.op);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].table, "users");
  const t = touchedBy(ops);
  assert.equal(t.goals, true);
  assert.equal(t.prefs, false);
});
