"use client";

// Fills in foods saved from a scan while offline, once the phone is back
// online: on open, when the connection returns and when the app comes back to
// the front. Quiet: saving the food refreshes the screens that show it.

import { useEffect } from "react";
import { findFoodBySource, listFoods, saveFood } from "@/lib/offline/nutrition-store";
import { offLookupCodes } from "@/lib/nutrition/barcode";
import { decideEnrichment, pendingFoods, pickBatch } from "@/lib/nutrition/enrich";
import type { RemoteFood } from "@/lib/nutrition/search";
import { createOffClient } from "@/lib/nutrition/sources/off";

const PER_PASS = 5;
const GAP_MS = 1000;

// Each pending food is looked up at most once per app session.
const tried = new Set<string>();
let running = false;
let off: ReturnType<typeof createOffClient> | null = null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findProduct(code: string): Promise<RemoteFood | null> {
  off ??= createOffClient();
  for (const form of offLookupCodes(code)) {
    const product = await off.getProduct(form);
    if (product) return product;
  }
  return null;
}

async function pass(): Promise<void> {
  if (running || !navigator.onLine) return;
  running = true;
  try {
    const batch = pickBatch(pendingFoods(await listFoods()), tried, PER_PASS);
    for (let i = 0; i < batch.length; i += 1) {
      if (i > 0) await wait(GAP_MS);
      if (!navigator.onLine) return;
      const food = batch[i];
      if (!food.barcode) continue;
      let product: RemoteFood | null;
      try {
        product = await findProduct(food.barcode);
      } catch {
        return; // Rate limit or no answer: stop, and try again next time.
      }
      tried.add(food.id);
      if (!product) continue;
      // Check the freshest copy: the person may have renamed or filled it in meanwhile.
      const decision = decideEnrichment(await listFoods(), food.id, product);
      if (decision.kind !== "apply" || decision.food.sourceId === null) continue;
      // The phone's list is capped: the same product may be saved only on the
      // server. Changing this food into a second copy would be refused there.
      const other = await findFoodBySource(decision.food.source, decision.food.sourceId, food.id);
      if (other === undefined) {
        tried.delete(food.id); // Couldn't ask the server: try again next pass.
        return;
      }
      if (other === null) await saveFood(decision.food);
    }
  } catch {
    // Reading or saving foods failed; leave the rest for the next pass.
  } finally {
    running = false;
  }
}

export function useBarcodeEnrichment(): void {
  useEffect(() => {
    const run = () => void pass();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    run();
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
