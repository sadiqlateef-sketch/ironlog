import { NutritionError } from "./http.ts";
import type { OffClient } from "./sources/off.ts";
import type { UsdaClient } from "./sources/usda.ts";
import type { RemoteFood } from "./types.ts";

export type { RemoteFood } from "./types.ts";

export type SearchSources = {
  off?: OffClient;
  usda?: { client: UsdaClient; apiKey: string };
};

export type SearchOptions = {
  sources: SearchSources;
  limits?: { off?: number; usda?: number };
};

export type SearchResult = {
  results: RemoteFood[];
  errors: { source: "off" | "usda"; error: NutritionError }[];
};

const DEFAULT_LIMIT = 50;

/** True when the trimmed query is a non-empty run of digits. */
export function isBarcodeQuery(q: string): boolean {
  return /^\d+$/.test(q.trim());
}

function dedupeKey(f: RemoteFood): string {
  return JSON.stringify([f.source, f.name.trim().toLowerCase(), f.brand ?? null, f.barcode ?? null]);
}

function dedupe(foods: RemoteFood[]): RemoteFood[] {
  const seen = new Set<string>();
  const out: RemoteFood[] = [];
  for (const f of foods) {
    const k = dedupeKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
  }
  return out;
}

function toNutritionError(e: unknown): NutritionError {
  if (e instanceof NutritionError) return e;
  return new NutritionError("unavailable", e instanceof Error ? e.message : "unknown error");
}

export async function searchFoods(query: string, options: SearchOptions): Promise<SearchResult> {
  const q = query.trim();
  const { off, usda } = options.sources;
  const offLimit = options.limits?.off ?? DEFAULT_LIMIT;
  const usdaLimit = options.limits?.usda ?? DEFAULT_LIMIT;
  const errors: SearchResult["errors"] = [];

  const offTask = async (): Promise<RemoteFood[]> => {
    if (!off) return [];
    try {
      let foods: RemoteFood[];
      if (isBarcodeQuery(q)) {
        const one = await off.getProduct(q);
        foods = one ? [one] : [];
      } else {
        foods = (await off.search(q)).foods;
      }
      return dedupe(foods).slice(0, offLimit);
    } catch (e) {
      errors.push({ source: "off", error: toNutritionError(e) });
      return [];
    }
  };

  const usdaTask = async (): Promise<RemoteFood[]> => {
    if (!usda) return [];
    try {
      const { foods } = await usda.client.search(q, usda.apiKey);
      return dedupe(foods).slice(0, usdaLimit);
    } catch (e) {
      errors.push({ source: "usda", error: toNutritionError(e) });
      return [];
    }
  };

  const [offFoods, usdaFoods] = await Promise.all([offTask(), usdaTask()]);
  errors.sort((a, b) => (a.source === b.source ? 0 : a.source === "off" ? -1 : 1));
  return { results: [...offFoods, ...usdaFoods], errors };
}
