import test from "node:test";
import assert from "node:assert/strict";
import { IronLogEcosystemSync, type CompletedWorkoutSummary } from "../src/services/ironlogEcosystemSync.ts";

test("ecosystem sync: operates cleanly in standalone mode when Capacitor plugin is missing", async () => {
  // Global window without Capacitor plugin
  (globalThis as unknown as { window: unknown }).window = {};

  const summary: CompletedWorkoutSummary = {
    id: "workout-standalone-1",
    title: "Heavy Bench",
    startTime: new Date().toISOString(),
    durationSeconds: 3600,
    totalVolumeLb: 15000,
    totalSets: 15,
    dailyStrain: 75,
    prsHit: ["Bench Press 225 lb"],
  };

  // Must not throw or reject
  await assert.doesNotReject(async () => {
    await IronLogEcosystemSync.onWorkoutCompleted(summary, "2026-10-24");
    await IronLogEcosystemSync.syncRecoveryToBujo(80, 50, "2026-10-24");
    const roi = await IronLogEcosystemSync.syncFitnessROIWithBudget(10, 50);
    assert.equal(roi, null);
  });
});

test("ecosystem sync: invokes Bujo tasks, The Grove Oak tree, and Braindump when plugin is present", async () => {
  const calls: { name: string; args: unknown }[] = [];

  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: {
      Plugins: {
        IronLogEcosystem: {
          upsertWorkoutRecord: async (data: unknown) => {
            calls.push({ name: "upsertWorkoutRecord", args: data });
          },
          completeBujoWorkoutAndWaterOak: async (data: unknown) => {
            calls.push({ name: "completeBujoWorkoutAndWaterOak", args: data });
          },
          pushWorkoutContextToBraindump: async (data: unknown) => {
            calls.push({ name: "pushWorkoutContextToBraindump", args: data });
          },
          syncRecoveryState: async (data: unknown) => {
            calls.push({ name: "syncRecoveryState", args: data });
          },
          queryBudgetFitnessSpend: async () => {
            calls.push({ name: "queryBudgetFitnessSpend", args: {} });
            return { monthlyGymAndSupplements: 75.0 };
          },
        },
      },
    },
  };

  const summary: CompletedWorkoutSummary = {
    id: "workout-eco-1",
    title: "Back & Bi Hypertrophy",
    startTime: new Date().toISOString(),
    durationSeconds: 2700,
    totalVolumeLb: 12500,
    totalSets: 18,
    dailyStrain: 70,
    prsHit: ["Deadlift 405 lb"],
  };

  await IronLogEcosystemSync.onWorkoutCompleted(summary, "2026-10-24");

  // Verify upsert to IronLogContentProvider
  const upsertCall = calls.find((c) => c.name === "upsertWorkoutRecord");
  assert.ok(upsertCall);
  assert.deepEqual(upsertCall.args, summary);

  // Verify Bujo Tasks Oak tree watering
  const bujoCall = calls.find((c) => c.name === "completeBujoWorkoutAndWaterOak");
  assert.ok(bujoCall);
  assert.deepEqual(bujoCall.args, {
    date: "2026-10-24",
    workoutTitle: "Back & Bi Hypertrophy",
    durationMinutes: 45,
    totalVolumeLb: 12500,
    strain: 70,
    treeSpecies: "oak",
    treeName: "Oak · Tree of Vitality",
  });

  // Verify Braindump reflection prompt (since PRs hit and strain >= 65)
  const brainCall = calls.find((c) => c.name === "pushWorkoutContextToBraindump");
  assert.ok(brainCall);
  const brainArgs = brainCall.args as { date: string; summaryText: string };
  assert.equal(brainArgs.date, "2026-10-24");
  assert.ok(brainArgs.summaryText.includes("Back & Bi Hypertrophy"));
  assert.ok(brainArgs.summaryText.includes("12,500 lb volume"));
  assert.ok(brainArgs.summaryText.includes("Deadlift 405 lb"));
});

test("ecosystem sync: skips Braindump context push when no PRs and strain is low", async () => {
  const calls: string[] = [];

  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: {
      Plugins: {
        IronLogEcosystem: {
          upsertWorkoutRecord: async () => { calls.push("upsert"); },
          completeBujoWorkoutAndWaterOak: async () => { calls.push("bujo"); },
          pushWorkoutContextToBraindump: async () => { calls.push("braindump"); },
        },
      },
    },
  };

  const summary: CompletedWorkoutSummary = {
    id: "workout-light-1",
    title: "Recovery Walk",
    startTime: new Date().toISOString(),
    durationSeconds: 1200,
    totalVolumeLb: 0,
    totalSets: 0,
    dailyStrain: 30,
    prsHit: [],
  };

  await IronLogEcosystemSync.onWorkoutCompleted(summary, "2026-10-24");

  assert.ok(calls.includes("upsert"));
  assert.ok(calls.includes("bujo"));
  assert.ok(!calls.includes("braindump")); // Low strain, no PR -> skip reflection push
});

test("ecosystem sync: recovery state recommends rest token on low recovery or extreme strain", async () => {
  let lastSync: { recoveryScore: number; dailyStrain: number; recommendRestToken: boolean } | null = null;

  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: {
      Plugins: {
        IronLogEcosystem: {
          syncRecoveryState: async (data: typeof lastSync) => {
            lastSync = data;
          },
        },
      },
    },
  };

  // Case 1: Low recovery score (< 35) -> recommendRestToken = true
  await IronLogEcosystemSync.syncRecoveryToBujo(30, 40, "2026-10-24");
  assert.ok(lastSync);
  assert.equal((lastSync as { recommendRestToken: boolean }).recommendRestToken, true);

  // Case 2: Extreme strain (>= 85) -> recommendRestToken = true
  await IronLogEcosystemSync.syncRecoveryToBujo(80, 88, "2026-10-24");
  assert.ok(lastSync);
  assert.equal((lastSync as { recommendRestToken: boolean }).recommendRestToken, true);

  // Case 3: Balanced recovery (75) and moderate strain (50) -> recommendRestToken = false
  await IronLogEcosystemSync.syncRecoveryToBujo(75, 50, "2026-10-24");
  assert.ok(lastSync);
  assert.equal((lastSync as { recommendRestToken: boolean }).recommendRestToken, false);
});

test("ecosystem sync: budget ROI calculates cost per workout and cost per ton", async () => {
  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: {
      Plugins: {
        IronLogEcosystem: {
          queryBudgetFitnessSpend: async () => ({ monthlyGymAndSupplements: 120.0 }),
        },
      },
    },
  };

  // 12 workouts, 60 tons (120,000 lb)
  const roi = await IronLogEcosystemSync.syncFitnessROIWithBudget(12, 60);
  assert.ok(roi);
  assert.equal(roi.monthlyGymAndSupplements, 120.0);
  assert.equal(roi.workoutsThisMonth, 12);
  assert.equal(roi.costPerWorkout, 10.0); // 120 / 12 = 10
  assert.equal(roi.costPerTon, 4000.0); // (120 / 60) * 2000 = 4000
});

test("ecosystem sync: tolerates plugin IPC rejections without throwing", async () => {
  (globalThis as unknown as { window: unknown }).window = {
    Capacitor: {
      Plugins: {
        IronLogEcosystem: {
          upsertWorkoutRecord: async () => { throw new Error("SQLite permission denied"); },
          completeBujoWorkoutAndWaterOak: async () => { throw new Error("Bujo Tasks not installed"); },
          pushWorkoutContextToBraindump: async () => { throw new Error("ContentProvider timeout"); },
        },
      },
    },
  };

  const summary: CompletedWorkoutSummary = {
    id: "workout-fail-1",
    title: "Chest Day",
    startTime: new Date().toISOString(),
    durationSeconds: 1800,
    totalVolumeLb: 8000,
    totalSets: 10,
    dailyStrain: 80,
    prsHit: ["Incline 185 lb"],
  };

  await assert.doesNotReject(async () => {
    await IronLogEcosystemSync.onWorkoutCompleted(summary, "2026-10-24");
  });
});
