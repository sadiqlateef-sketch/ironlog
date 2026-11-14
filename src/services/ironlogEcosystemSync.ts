// File: src/services/ironlogEcosystemSync.ts
export interface CompletedWorkoutSummary {
  id: string;
  title: string;
  startTime: string;
  durationSeconds: number;
  totalVolumeLb: number;
  totalSets: number;
  avgHr?: number;
  dailyStrain: number;
  prsHit: string[];
}

export interface TodayPlanExercise {
  name: string;
  sets: number;
  reps: string;
  weightLb: number | null;
}

export interface TodayPlan {
  date: string;
  routineName: string;
  programName: string;
  week: number;
  day: number;
  exercises: TodayPlanExercise[];
}

/** One food day for other apps (content://com.ironlog.app.provider/nutrition). Null = unknown or no goal. */
export interface NutritionDaySummary {
  date: string;
  kcal: number;
  protein: number;
  goalKcal: number | null;
  goalProtein: number | null;
  waterMl: number;
  entries: number;
  streak: number;
}

/** Text for the home-screen food widget (F29). Numbers only, from the day itself; no goal means no "left". */
export interface WidgetPayload {
  widgetTitle: string;
  widgetLine1: string;
  widgetLine2: string;
}

export function widgetPayload(day: NutritionDaySummary | null): WidgetPayload {
  if (!day) return { widgetTitle: "Food today", widgetLine1: "Nothing logged yet", widgetLine2: "Tap Log food to add a meal" };
  const kcal = Math.max(0, Math.round(day.kcal));
  const protein = Math.max(0, Math.round(day.protein));
  const water = Math.max(0, Math.round(day.waterMl));
  let line1: string;
  if (day.entries === 0 && kcal === 0) line1 = "Nothing logged yet";
  else if (day.goalKcal !== null && day.goalKcal > 0) {
    const left = Math.round(day.goalKcal - kcal);
    line1 = left >= 0 ? `${left} kcal left` : `${-left} kcal over`;
  } else line1 = `${kcal} kcal`;
  const p = day.goalProtein !== null && day.goalProtein > 0 ? `${protein}/${Math.round(day.goalProtein)} g protein` : `${protein} g protein`;
  const w = water > 0 ? ` · ${water >= 1000 ? `${Math.round(water / 100) / 10} L` : `${water} ml`} water` : "";
  return { widgetTitle: "Food today", widgetLine1: line1, widgetLine2: p + w };
}

/** Where an ironlog:// link opens in the app, or null if it isn't one of ours. */
export function deepLinkPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^ironlog:\/\/food(?:\/add)?\/?(?:[?#].*)?$/i.exec(url.trim());
  return m ? "/food/add/" : null;
}

interface IronLogEcosystemPlugin {
  upsertTodayPlan?: (plan: TodayPlan) => Promise<void>;
  upsertNutritionDay?: (day: NutritionDaySummary & WidgetPayload) => Promise<void>;
  upsertWorkoutRecord?: (summary: CompletedWorkoutSummary) => Promise<void>;
  completeBujoWorkoutAndWaterOak?: (data: {
    date: string;
    workoutTitle: string;
    durationMinutes: number;
    totalVolumeLb: number;
    strain: number;
    treeSpecies: string;
    treeName: string;
  }) => Promise<void>;
  pushWorkoutContextToBraindump?: (data: { date: string; summaryText: string }) => Promise<void>;
  syncRecoveryState?: (data: {
    date: string;
    recoveryScore: number;
    dailyStrain: number;
    recommendRestToken: boolean;
  }) => Promise<void>;
  queryBudgetFitnessSpend?: () => Promise<{ monthlyGymAndSupplements?: number }>;
}

function getEcosystemPlugin(): IronLogEcosystemPlugin | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as unknown as {
    Capacitor?: {
      Plugins?: {
        IronLogEcosystem?: IronLogEcosystemPlugin;
      };
    };
  };
  return win.Capacitor?.Plugins?.IronLogEcosystem;
}

let nutritionTimer: ReturnType<typeof setTimeout> | null = null;

export const IronLogEcosystemSync = {
  /**
   * 1. IronLog -> Bujo Tasks + The Grove + Braindump:
   * Called automatically when "Finish workout" is tapped in IronLog.
   * - Checks off today's Gym/Workout task in Bujo Tasks
   * - Waters the "Oak · Tree of Vitality" in Bujo Tasks' The Grove
   * - Logs duration to Bujo TimeLogs
   * - Sends PR & Volume summary to Braindump for evening reflection
   */
  async onWorkoutCompleted(summary: CompletedWorkoutSummary, todayIso: string) {
    const plugin = getEcosystemPlugin();
    if (!plugin) return;

    // A. Mirror workout to native IronLogContentProvider
    try {
      await plugin.upsertWorkoutRecord?.(summary);
    } catch (e) {
      console.warn("Ecosystem: Failed to upsert to IronLogContentProvider", e);
    }

    // B. Check off matching Gym/Workout task & water Oak tree in Bujo Tasks
    try {
      await plugin.completeBujoWorkoutAndWaterOak?.({
        date: todayIso,
        workoutTitle: summary.title,
        durationMinutes: Math.max(1, Math.round(summary.durationSeconds / 60)),
        totalVolumeLb: summary.totalVolumeLb,
        strain: summary.dailyStrain,
        treeSpecies: 'oak',
        treeName: 'Oak · Tree of Vitality'
      });
    } catch (e) {
      console.warn("Ecosystem: Failed to sync to Bujo Tasks", e);
    }

    // C. Push PR & endorphin context to Braindump for Nashae's evening reflection prompt
    if (summary.prsHit.length > 0 || summary.dailyStrain >= 65) {
      try {
        await plugin.pushWorkoutContextToBraindump?.({
          date: todayIso,
          summaryText: `Trained ${summary.title} (${Math.round(summary.totalVolumeLb).toLocaleString()} lb volume, Strain ${summary.dailyStrain}/100${
            summary.prsHit.length ? `, PRs: ${summary.prsHit.join(', ')}` : ''
          })`
        });
      } catch (e) {
        console.warn("Ecosystem: Failed to push context to Braindump", e);
      }
    }
  },

  /**
   * IronLog -> Bujo Tasks: today's planned workout (read-only for Bujo, via today_plan).
   * An empty exercise list means a rest day or no active program.
   */
  async syncTodayPlan(plan: TodayPlan) {
    const plugin = getEcosystemPlugin();
    if (!plugin?.upsertTodayPlan) return;
    try {
      await plugin.upsertTodayPlan(plan);
    } catch (e) {
      console.warn("Ecosystem: Failed to publish today's plan", e);
    }
  },

  /**
   * IronLog -> other apps: today's food totals (read-only, via the nutrition table).
   * Debounced, so a burst of diary changes publishes once. Android app only.
   */
  syncNutritionDay(day: NutritionDaySummary, delayMs = 2000) {
    const plugin = getEcosystemPlugin();
    if (!plugin?.upsertNutritionDay) return;
    if (nutritionTimer) clearTimeout(nutritionTimer);
    // The plugin also refreshes the home-screen widget from the widget fields.
    nutritionTimer = setTimeout(() => {
      nutritionTimer = null;
      plugin.upsertNutritionDay?.({ ...day, ...widgetPayload(day) }).catch((e: unknown) => console.warn("Ecosystem: Failed to publish today's food", e));
    }, delayMs);
  },

  /**
   * 2. IronLog Strain/Recovery -> Bujo Auto Time-Block & Streak Insurance:
   * If Daily Strain >= 85 or Recovery < 35%, notify Bujo Tasks to protect recovery.
   */
  async syncRecoveryToBujo(recoveryScore: number, dailyStrain: number, todayIso: string) {
    const plugin = getEcosystemPlugin();
    if (!plugin?.syncRecoveryState) return;
    try {
      await plugin.syncRecoveryState({
        date: todayIso,
        recoveryScore,
        dailyStrain,
        recommendRestToken: recoveryScore < 35 || dailyStrain >= 85
      });
    } catch (e) {
      console.warn("Ecosystem: Failed to sync recovery to Bujo Tasks", e);
    }
  },

  /**
   * 3. IronLog <-> Budget Cost-Per-Workout & Post-Workout Impulse Guard:
   * Computes live Cost-Per-Workout from monthly gym/supplement envelopes and activates
   * a 90-minute post-workout fast-food impulse guard in Budget.
   */
  async syncFitnessROIWithBudget(workoutsThisMonth: number, totalTonnageThisMonth: number) {
    const plugin = getEcosystemPlugin();
    if (!plugin?.queryBudgetFitnessSpend) return null;
    const { monthlyGymAndSupplements = 0 } = await plugin.queryBudgetFitnessSpend();
    const costPerWorkout = workoutsThisMonth > 0 ? monthlyGymAndSupplements / workoutsThisMonth : monthlyGymAndSupplements;
    return {
      monthlyGymAndSupplements,
      workoutsThisMonth,
      costPerWorkout: Number(costPerWorkout.toFixed(2)),
      costPerTon: totalTonnageThisMonth > 0 ? Number(((monthlyGymAndSupplements / totalTonnageThisMonth) * 2000).toFixed(2)) : 0
    };
  }
};
