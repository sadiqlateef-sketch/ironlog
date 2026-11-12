// Wires the food search to the real sources. The USDA key is read here and
// handed to the USDA client only; error text shown to people is fixed wording,
// never the raw error, so the key cannot leak through it.

import { NutritionError } from "./http.ts";
import { getUsdaKey } from "./key-store.ts";
import { searchFoods } from "./search.ts";
import type { RemoteFood } from "./search.ts";
import { createOffClient } from "./sources/off.ts";
import { createUsdaClient } from "./sources/usda.ts";

export type SearchNote = { source: "off" | "usda"; message: string };
export type FoodSearchOutcome = { results: RemoteFood[]; notes: SearchNote[]; usdaSkipped: boolean };

export function explainSearchError(source: "off" | "usda", error: NutritionError): string {
  const who = source === "usda" ? "USDA" : "Open Food Facts";
  if (error.code === "unauthorized") return source === "usda" ? "Check your USDA key in Settings" : `${who} said no`;
  if (error.code === "rate-limited") return "Too many searches, wait a minute";
  return `${who} isn't answering right now`;
}

let off: ReturnType<typeof createOffClient> | null = null;
let usda: ReturnType<typeof createUsdaClient> | null = null;

export async function runFoodSearch(query: string): Promise<FoodSearchOutcome> {
  off ??= createOffClient();
  const apiKey = getUsdaKey();
  const sources: Parameters<typeof searchFoods>[1]["sources"] = { off };
  if (apiKey !== "") {
    usda ??= createUsdaClient();
    sources.usda = { client: usda, apiKey };
  }
  const res = await searchFoods(query, { sources });
  return {
    results: res.results,
    notes: res.errors.map((e) => ({ source: e.source, message: explainSearchError(e.source, e.error) })),
    usdaSkipped: apiKey === "",
  };
}
