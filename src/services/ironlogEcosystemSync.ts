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
    const plugin = (window as any).Capacitor?.Plugins?.IronLogEcosystem;
    if (!plugin) return;

    // A. Mirror workout to native IronLogContentProvider
    await plugin.upsertWorkoutRecord?.(summary);

    // B. Check off matching Gym/Workout task & water Oak tree in Bujo Tasks
    await plugin.completeBujoWorkoutAndWaterOak?.({
      date: todayIso,
      workoutTitle: summary.title,
      durationMinutes: Math.max(1, Math.round(summary.durationSeconds / 60)),
      totalVolumeLb: summary.totalVolumeLb,
      strain: summary.dailyStrain,
      treeSpecies: 'oak',
      treeName: 'Oak · Tree of Vitality'
    });

    // C. Push PR & endorphin context to Braindump for Nashae's evening reflection prompt
    if (summary.prsHit.length > 0 || summary.dailyStrain >= 65) {
      await plugin.pushWorkoutContextToBraindump?.({
        date: todayIso,
        summaryText: `Trained ${summary.title} (${Math.round(summary.totalVolumeLb).toLocaleString()} lb volume, Strain ${summary.dailyStrain}/100${
          summary.prsHit.length ? `, PRs: ${summary.prsHit.join(', ')}` : ''
        })`
      });
    }
  },

  /**
   * 2. IronLog Strain/Recovery -> Bujo Auto Time-Block & Streak Insurance:
   * If Daily Strain >= 85 or Recovery < 35%, notify Bujo Tasks to protect recovery.
   */
  async syncRecoveryToBujo(recoveryScore: number, dailyStrain: number, todayIso: string) {
    const plugin = (window as any).Capacitor?.Plugins?.IronLogEcosystem;
    if (!plugin?.syncRecoveryState) return;
    await plugin.syncRecoveryState({
      date: todayIso,
      recoveryScore,
      dailyStrain,
      recommendRestToken: recoveryScore < 35 || dailyStrain >= 85
    });
  },

  /**
   * 3. IronLog <-> Budget Cost-Per-Workout & Post-Workout Impulse Guard:
   * Computes live Cost-Per-Workout from monthly gym/supplement envelopes and activates
   * a 90-minute post-workout fast-food impulse guard in Budget.
   */
  async syncFitnessROIWithBudget(workoutsThisMonth: number, totalTonnageThisMonth: number) {
    const plugin = (window as any).Capacitor?.Plugins?.IronLogEcosystem;
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
