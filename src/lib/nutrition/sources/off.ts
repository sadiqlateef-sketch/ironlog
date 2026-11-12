import { capacitorGet, createRateLimiter, NutritionError } from "../http.ts";
import type { HttpGet, HttpResponse } from "../http.ts";
import { complete, derived, emptyNutrients } from "../nutrients.ts";
import type { NutrientKey, Nutrients } from "../nutrients.ts";
import type { RemoteFood } from "../types.ts";

const OFF_BASE = "https://world.openfoodfacts.org";
export const OFF_FIELDS =
  "product_name,code,nutriments,brands,serving_quantity,serving_quantity_unit,product_quantity,product_quantity_unit,url";

/** Nutrient key -> key in OFF's per-100 g `nutriments` object. */
const OFF_KEYS: Record<NutrientKey, string> = {
  energy: "energy-kcal_100g",
  protein: "proteins_100g",
  carbohydrates: "carbohydrates_100g",
  fat: "fat_100g",
  saturatedFat: "saturated-fat_100g",
  transFat: "trans-fat_100g",
  monounsaturatedFat: "monounsaturated-fat_100g",
  polyunsaturatedFat: "polyunsaturated-fat_100g",
  omega3: "omega-3-fat_100g",
  omega6: "omega-6-fat_100g",
  sugars: "sugars_100g",
  addedSugars: "added-sugars_100g",
  salt: "salt_100g",
  fiber: "fiber_100g",
  solubleFiber: "soluble-fiber_100g",
  insolubleFiber: "insoluble-fiber_100g",
  cholesterol: "cholesterol_100g",
  caffeine: "caffeine_100g",
  vitaminA: "vitamin-a_100g",
  vitaminB1: "vitamin-b1_100g",
  vitaminB2: "vitamin-b2_100g",
  vitaminB3: "vitamin-pp_100g",
  vitaminB5: "pantothenic-acid_100g",
  vitaminB6: "vitamin-b6_100g",
  vitaminB7: "biotin_100g",
  vitaminB9: "vitamin-b9_100g",
  vitaminB12: "vitamin-b12_100g",
  vitaminC: "vitamin-c_100g",
  vitaminD: "vitamin-d_100g",
  vitaminE: "vitamin-e_100g",
  vitaminK: "vitamin-k_100g",
  manganese: "manganese_100g",
  magnesium: "magnesium_100g",
  potassium: "potassium_100g",
  calcium: "calcium_100g",
  copper: "copper_100g",
  zinc: "zinc_100g",
  sodium: "sodium_100g",
  iron: "iron_100g",
  phosphorus: "phosphorus_100g",
  selenium: "selenium_100g",
  iodine: "iodine_100g",
  chromium: "chromium_100g",
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Numbers sometimes arrive as strings. */
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

type Quantity = { amount: number; unit: "g" | "ml" };

function quantity(amountRaw: unknown, unitRaw: unknown): Quantity | null {
  const amount = toNumber(amountRaw);
  if (amount === null || amount <= 0) return null;
  const unit = toText(unitRaw)?.toLowerCase() ?? "g";
  if (unit === "g" || unit === "ml") return { amount, unit };
  return null;
}

function isMl(unitRaw: unknown): boolean {
  return toText(unitRaw)?.toLowerCase() === "ml";
}

function mapNutrients(nutriments: Record<string, unknown>): Nutrients {
  const out = emptyNutrients();
  for (const key of Object.keys(OFF_KEYS) as NutrientKey[]) {
    const n = toNumber(nutriments[OFF_KEYS[key]]);
    if (n !== null && n >= 0) out[key] = complete(n);
  }
  if (out.sodium.state === "incomplete" && out.salt.state === "complete") {
    out.sodium = derived(out.salt.value / 2.5, "sodium=salt/2.5");
  }
  return out;
}

/** Map one OFF product object (not the response envelope). Null when unusable. */
export function mapOffProduct(raw: unknown): RemoteFood | null {
  if (!isRecord(raw)) return null;
  const name = toText(raw.product_name);
  if (name === null) return null;
  const code = toText(raw.code);
  if (code === null) return null;
  if (!isRecord(raw.nutriments)) return null;

  const serving = quantity(raw.serving_quantity, raw.serving_quantity_unit);
  const packageAmount = quantity(raw.product_quantity, raw.product_quantity_unit);
  const liquid = isMl(raw.serving_quantity_unit) || isMl(raw.product_quantity_unit);

  return {
    source: "off",
    sourceId: code,
    name,
    brand: toText(raw.brands),
    barcode: code,
    sourceUrl: toText(raw.url) ?? `${OFF_BASE}/product/${code}`,
    liquid,
    serving,
    packageAmount,
    nutrients: mapNutrients(raw.nutriments),
    droppedUnits: [],
  };
}

export type OffClient = {
  getProduct(barcode: string): Promise<RemoteFood | null>;
  search(query: string, page?: number): Promise<{ count: number; foods: RemoteFood[] }>;
};

function checkStatus(res: HttpResponse): void {
  if (res.status >= 200 && res.status < 300) return;
  if (res.status === 503) throw new NutritionError("unavailable", "HTTP 503");
  if (res.status === 429) throw new NutritionError("rate-limited", "HTTP 429");
  throw new NutritionError("bad-response", `HTTP ${res.status}`);
}

export function createOffClient(opts: { get?: HttpGet; now?: () => number } = {}): OffClient {
  const get = opts.get ?? capacitorGet;
  const productLimiter = createRateLimiter(100, 60_000, opts.now);
  const searchLimiter = createRateLimiter(10, 60_000, opts.now);

  return {
    async getProduct(barcode) {
      if (!productLimiter.take()) throw new NutritionError("rate-limited", "local product limit");
      const res = await get(`${OFF_BASE}/api/v2/product/${encodeURIComponent(barcode.trim())}`, {
        fields: OFF_FIELDS,
      });
      if (res.status === 404) return null;
      checkStatus(res);
      if (!isRecord(res.data)) throw new NutritionError("bad-response", "not an object");
      return mapOffProduct(res.data.product);
    },

    async search(query, page = 1) {
      if (!searchLimiter.take()) throw new NutritionError("rate-limited", "local search limit");
      const res = await get(`${OFF_BASE}/cgi/search.pl`, {
        search_simple: "1",
        json: "1",
        search_terms: query,
        page: String(page),
        page_size: "50",
        sort_by: "product_name",
        fields: OFF_FIELDS,
      });
      checkStatus(res);
      if (!isRecord(res.data) || !Array.isArray(res.data.products)) {
        throw new NutritionError("bad-response", "no products array");
      }
      const foods: RemoteFood[] = [];
      for (const p of res.data.products) {
        const food = mapOffProduct(p);
        if (food !== null) foods.push(food);
      }
      return { count: toNumber(res.data.count) ?? foods.length, foods };
    },
  };
}
