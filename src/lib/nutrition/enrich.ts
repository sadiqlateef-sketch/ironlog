// Foods saved from a scan while offline, and filling them in later from
// Open Food Facts. The pending food keeps its id, so diary entries that point
// at it stay attached; those entries keep the amounts they were logged with.

import { isPendingFood, pendingLabel } from "./barcode.ts";
import type { Food } from "./diary-types.ts";
import { emptyNutrients } from "./nutrients.ts";
import type { RemoteFood } from "./search.ts";

export const PENDING_NOTE = "Saved from a scan while offline. Details fill in when you are back online.";

export function makePendingFood(code: string, id: string): Food {
  return {
    id,
    name: pendingLabel(code),
    brand: null,
    barcode: code,
    liquid: false,
    servingAmount: null,
    packageAmount: null,
    nutrients: emptyNutrients(),
    source: "user",
    sourceId: null,
    sourceUrl: null,
    note: PENDING_NOTE,
    archived: false,
  };
}

export function pendingFoods(foods: readonly Food[]): Food[] {
  return foods.filter(isPendingFood);
}

/** Up to `max` pending foods not yet tried this session, in list order. */
export function pickBatch(pending: readonly Food[], tried: ReadonlySet<string>, max: number): Food[] {
  const out: Food[] = [];
  for (const f of pending) {
    if (out.length >= max) break;
    if (!tried.has(f.id)) out.push(f);
  }
  return out;
}

/** The pending food filled in from the product. Same id; archived state kept. */
export function applyEnrichment(pending: Food, remote: RemoteFood): Food {
  return {
    id: pending.id,
    name: remote.name,
    brand: remote.brand,
    barcode: remote.barcode ?? pending.barcode,
    liquid: remote.liquid,
    servingAmount: remote.serving?.amount ?? null,
    packageAmount: remote.packageAmount?.amount ?? null,
    nutrients: remote.nutrients,
    source: remote.source,
    sourceId: remote.sourceId,
    sourceUrl: remote.sourceUrl,
    note: null,
    archived: pending.archived,
  };
}

export type EnrichDecision =
  | { kind: "apply"; food: Food }
  | { kind: "not-pending" }
  | { kind: "duplicate"; existing: Food };

/**
 * Decide against the freshest copy of the foods: skip a food the person has
 * since named or filled in, and skip when the product is already saved as
 * another food (one food per source and id).
 */
export function decideEnrichment(foods: readonly Food[], pendingId: string, remote: RemoteFood): EnrichDecision {
  const fresh = foods.find((f) => f.id === pendingId);
  if (!fresh || !isPendingFood(fresh)) return { kind: "not-pending" };
  const existing = foods.find((f) => f.id !== pendingId && f.source === remote.source && f.sourceId === remote.sourceId);
  if (existing) return { kind: "duplicate", existing };
  return { kind: "apply", food: applyEnrichment(fresh, remote) };
}
