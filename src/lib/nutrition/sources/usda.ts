import { capacitorGet, NutritionError } from "../http.ts";
import type { HttpGet, HttpResponse } from "../http.ts";
import { complete, derived, emptyNutrients, toGrams } from "../nutrients.ts";
import type { NutrientKey, Nutrients } from "../nutrients.ts";
import type { RemoteFood } from "../types.ts";

const FDC_BASE = "https://api.nal.usda.gov/fdc/v1";

/**
 * Legacy nutrient number -> nutrient key. Keyed on the nutrient number, never on the FDC
 * nutrient id (energy is number 208 but id 1008). Energy (208/957) is handled separately.
 */
const USDA_NUMBERS: Record<string, NutrientKey> = {
  "203": "protein",
  "205": "carbohydrates",
  "204": "fat",
  "606": "saturatedFat",
  "605": "transFat",
  "645": "monounsaturatedFat",
  "646": "polyunsaturatedFat",
  "269": "sugars",
  "539": "addedSugars",
  "291": "fiber",
  "601": "cholesterol",
  "262": "caffeine",
  "320": "vitaminA",
  "404": "vitaminB1",
  "405": "vitaminB2",
  "406": "vitaminB3",
  "410": "vitaminB5",
  "415": "vitaminB6",
  "416": "vitaminB7",
  "417": "vitaminB9",
  "418": "vitaminB12",
  "401": "vitaminC",
  "324": "vitaminD",
  "323": "vitaminE",
  "430": "vitaminK",
  "315": "manganese",
  "304": "magnesium",
  "306": "potassium",
  "301": "calcium",
  "312": "copper",
  "309": "zinc",
  "307": "sodium",
  "303": "iron",
  "305": "phosphorus",
  "317": "selenium",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toText(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type Row = { number: string; amount: number; unit: string };

function readRows(list: unknown, numberKey: string, amountKey: string): Row[] {
  if (!Array.isArray(list)) return [];
  const rows: Row[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const number = toText(entry[numberKey]);
    const amount = toNumber(entry[amountKey]);
    if (number === null || amount === null || amount < 0) continue;
    rows.push({ number, amount, unit: toText(entry.unitName) ?? "" });
  }
  return rows;
}

function mapRows(rows: Row[]): { nutrients: Nutrients; droppedUnits: string[] } {
  const nutrients = emptyNutrients();
  const droppedUnits: string[] = [];
  const seen = new Set<string>();
  let energy208: number | null = null;
  let energy957: number | null = null;
  // 328 is FDC's vitamin D in micrograms; used only when 324 gave no usable value (324 usually arrives in IU).
  let vitaminD328: number | null = null;

  for (const row of rows) {
    if (row.number === "328") {
      vitaminD328 ??= toGrams(row.amount, row.unit);
      continue;
    }
    if (row.number === "208") {
      energy208 ??= row.amount;
      continue;
    }
    if (row.number === "957") {
      energy957 ??= row.amount;
      continue;
    }
    const key = USDA_NUMBERS[row.number];
    if (key === undefined || seen.has(row.number)) continue;
    seen.add(row.number);
    const grams = toGrams(row.amount, row.unit);
    if (grams === null) {
      if (!droppedUnits.includes(key)) droppedUnits.push(key);
      continue;
    }
    nutrients[key] = complete(grams);
  }

  if (nutrients.vitaminD.state !== "complete" && vitaminD328 !== null) {
    nutrients.vitaminD = complete(vitaminD328);
    const i = droppedUnits.indexOf("vitaminD");
    if (i !== -1) droppedUnits.splice(i, 1);
  }

  const energy = energy208 ?? energy957;
  if (energy !== null) {
    nutrients.energy = complete(energy);
  } else if (
    nutrients.protein.state === "complete" &&
    nutrients.carbohydrates.state === "complete" &&
    nutrients.fat.state === "complete"
  ) {
    const kcal = 4 * nutrients.protein.value + 4 * nutrients.carbohydrates.value + 9 * nutrients.fat.value;
    nutrients.energy = derived(kcal, "energy=4P+4C+9F");
  }
  return { nutrients, droppedUnits };
}

function servingFrom(sizeRaw: unknown, unitRaw: unknown): { serving: RemoteFood["serving"]; liquid: boolean } {
  const none = { serving: null, liquid: false };
  const size = toNumber(sizeRaw);
  const unit = toText(unitRaw)?.toLowerCase();
  if (size === null || size <= 0 || unit === undefined) return none;
  if (unit === "g" || unit === "grm") return { serving: { amount: size, unit: "g" }, liquid: false };
  if (unit === "ml" || unit === "mlt") return { serving: { amount: size, unit: "ml" }, liquid: true };
  return none;
}

function build(
  raw: Record<string, unknown>,
  rows: Row[],
  serving: RemoteFood["serving"],
  liquid: boolean,
): RemoteFood | null {
  const fdcId = toNumber(raw.fdcId);
  if (fdcId === null || !Number.isInteger(fdcId)) return null;
  const name = toText(raw.description);
  if (name === null) return null;
  const { nutrients, droppedUnits } = mapRows(rows);
  return {
    source: "usda",
    sourceId: String(fdcId),
    name,
    brand: toText(raw.brandOwner),
    barcode: toText(raw.gtinUpc),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${fdcId}/nutrients`,
    liquid,
    serving,
    packageAmount: null,
    nutrients,
    droppedUnits,
  };
}

/** One element of a /foods/search response (rows use nutrientNumber / value / unitName). */
export function mapUsdaSearchFood(raw: unknown): RemoteFood | null {
  if (!isRecord(raw)) return null;
  const { serving, liquid } = servingFrom(raw.servingSize, raw.servingSizeUnit);
  return build(raw, readRows(raw.foodNutrients, "nutrientNumber", "value"), serving, liquid);
}

/** An abridged /food/{fdcId} response (rows use number / amount / unitName; no serving). */
export function mapUsdaDetailFood(raw: unknown): RemoteFood | null {
  if (!isRecord(raw)) return null;
  return build(raw, readRows(raw.foodNutrients, "number", "amount"), null, false);
}

export type UsdaClient = {
  search(query: string, apiKey: string, pageNumber?: number): Promise<{ totalHits: number; foods: RemoteFood[] }>;
  getFood(fdcId: number | string, apiKey: string): Promise<RemoteFood | null>;
};

function checkStatus(res: HttpResponse): void {
  const s = res.status;
  if (s >= 200 && s < 300) return;
  if (s === 429) throw new NutritionError("rate-limited", "HTTP 429");
  if (s === 403) {
    let reason: string | undefined;
    if (isRecord(res.data) && isRecord(res.data.error) && typeof res.data.error.code === "string") {
      reason = res.data.error.code;
    }
    throw new NutritionError("unauthorized", reason);
  }
  if (s === 404) throw new NutritionError("not-found");
  if (s === 400) throw new NutritionError("bad-response", "HTTP 400");
  if (s >= 500) throw new NutritionError("unavailable", `HTTP ${s}`);
  throw new NutritionError("bad-response", `HTTP ${s}`);
}

function requireKey(apiKey: string): void {
  if (apiKey.trim() === "") throw new NutritionError("unauthorized", "API_KEY_MISSING");
}

export function createUsdaClient(opts: { get?: HttpGet } = {}): UsdaClient {
  const get = opts.get ?? capacitorGet;

  return {
    async search(query, apiKey, pageNumber = 1) {
      requireKey(apiKey);
      const res = await get(`${FDC_BASE}/foods/search`, {
        api_key: apiKey,
        query,
        pageSize: "200",
        pageNumber: String(pageNumber),
      });
      checkStatus(res);
      if (!isRecord(res.data) || !Array.isArray(res.data.foods)) {
        throw new NutritionError("bad-response", "no foods array");
      }
      const foods: RemoteFood[] = [];
      for (const f of res.data.foods) {
        const food = mapUsdaSearchFood(f);
        if (food !== null) foods.push(food);
      }
      return { totalHits: toNumber(res.data.totalHits) ?? foods.length, foods };
    },

    async getFood(fdcId, apiKey) {
      requireKey(apiKey);
      const res = await get(`${FDC_BASE}/food/${encodeURIComponent(String(fdcId))}`, {
        api_key: apiKey,
        format: "abridged",
      });
      checkStatus(res);
      return mapUsdaDetailFood(res.data);
    },
  };
}
