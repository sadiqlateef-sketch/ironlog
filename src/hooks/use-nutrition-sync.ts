"use client";

import { useSyncExternalStore } from "react";
import { getNutritionSyncStatus, subscribeNutritionSync, type NutritionSyncStatus } from "@/lib/offline/nutrition-outbox";

/** Food changes waiting to sync (see nutrition-outbox.ts). */
export function useNutritionSync(): NutritionSyncStatus {
  return useSyncExternalStore(subscribeNutritionSync, getNutritionSyncStatus, getNutritionSyncStatus);
}
