// How nutrients are shown on screen: label, unit and a display scale. Values are
// stored in grams (kcal for energy); sodium and caffeine read better in mg.

import type { NutrientKey, NutrientValue } from "./nutrients.ts";
import { formatTotal } from "./entry-math.ts";
import type { EntryUnit } from "./diary-types.ts";

export interface NutrientDisplay {
  label: string;
  unit: string;
  /** Multiply the stored value by this to get the shown unit. */
  scale: number;
}

export const NUTRIENT_DISPLAY: Partial<Record<NutrientKey, NutrientDisplay>> = {
  energy: { label: "Energy", unit: "kcal", scale: 1 },
  protein: { label: "Protein", unit: "g", scale: 1 },
  carbohydrates: { label: "Carbs", unit: "g", scale: 1 },
  fat: { label: "Fat", unit: "g", scale: 1 },
  fiber: { label: "Fiber", unit: "g", scale: 1 },
  sugars: { label: "Sugars", unit: "g", scale: 1 },
  sodium: { label: "Sodium", unit: "mg", scale: 1000 },
  caffeine: { label: "Caffeine", unit: "mg", scale: 1000 },
};

/** "12", "≥ 12", "~12" or "–", in the unit shown for this nutrient. */
export function showNutrient(key: NutrientKey, v: NutrientValue): string {
  const scale = NUTRIENT_DISPLAY[key]?.scale ?? 1;
  return formatTotal({ ...v, value: v.value * scale }, 0);
}

const UNIT_LABEL: Record<EntryUnit, string> = {
  g: "g",
  ml: "ml",
  oz: "oz",
  fl_oz: "fl oz",
  serving: "serving",
  package: "package",
  quick: "quick",
};

export function unitLabel(unit: EntryUnit, quantity = 1): string {
  if ((unit === "serving" || unit === "package") && quantity !== 1) return `${UNIT_LABEL[unit]}s`;
  return UNIT_LABEL[unit];
}

/** "150 g", "2 servings", or "Quick add". */
export function amountText(quantity: number, unit: EntryUnit): string {
  if (unit === "quick") return "Quick add";
  return `${Number(quantity.toFixed(2))} ${unitLabel(unit, quantity)}`;
}

/** Parse what someone typed into an amount box; null when it isn't a positive number. */
export function parseAmount(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
