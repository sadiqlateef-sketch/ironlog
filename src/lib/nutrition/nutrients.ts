export const NUTRIENT_KEYS = [
  "energy", "protein", "carbohydrates", "fat", "saturatedFat", "transFat",
  "monounsaturatedFat", "polyunsaturatedFat", "omega3", "omega6",
  "sugars", "addedSugars", "salt", "fiber", "solubleFiber", "insolubleFiber",
  "cholesterol", "caffeine",
  "vitaminA", "vitaminB1", "vitaminB2", "vitaminB3", "vitaminB5", "vitaminB6",
  "vitaminB7", "vitaminB9", "vitaminB12", "vitaminC", "vitaminD", "vitaminE", "vitaminK",
  "manganese", "magnesium", "potassium", "calcium", "copper", "zinc", "sodium",
  "iron", "phosphorus", "selenium", "iodine", "chromium",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type NutrientState = "complete" | "incomplete" | "derived";

/** Incomplete with value 0 means unknown; an incomplete total carries the sum of its known parts. */
export type NutrientValue = { value: number; state: NutrientState; rule?: string };

/** Per 100 g (100 ml for liquids). Energy is kcal, everything else grams. */
export type Nutrients = Record<NutrientKey, NutrientValue>;

export function complete(value: number): NutrientValue {
  return { value, state: "complete" };
}

export function incomplete(): NutrientValue {
  return { value: 0, state: "incomplete" };
}

export function derived(value: number, rule: string): NutrientValue {
  return { value, state: "derived", rule };
}

export function emptyNutrients(): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) out[key] = incomplete();
  return out;
}

export function addValues(a: NutrientValue, b: NutrientValue): NutrientValue {
  const value = a.value + b.value;
  if (a.state === "incomplete" || b.state === "incomplete") return { value, state: "incomplete" };
  if (a.state === "derived" || b.state === "derived") return { value, state: "derived" };
  return { value, state: "complete" };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) out[key] = addValues(a[key], b[key]);
  return out;
}

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  const out = {} as Nutrients;
  for (const key of NUTRIENT_KEYS) {
    const v = n[key];
    out[key] = v.rule === undefined
      ? { value: v.value * factor, state: v.state }
      : { value: v.value * factor, state: v.state, rule: v.rule };
  }
  return out;
}

/** Convert a mass amount to grams; null when the unit is not a usable mass (e.g. IU). */
export function toGrams(amount: number, unit: string): number | null {
  switch (unit.trim().toLowerCase()) {
    case "g": return amount;
    case "mg": return amount * 0.001;
    case "ug":
    case "µg":
    case "μg":
    case "mcg": return amount * 0.000001;
    default: return null;
  }
}
