// Spoken food, parsed on the phone: "two eggs and a cup of rice" becomes
// [{2, null, "eggs"}, {1, null, "rice", measure "cup"}]. No AI, no network:
// number words, simple fractions, a few units, and a split on "and" / commas.
// Nothing is ever logged from here; the screen shows a list to confirm.

import { allowedUnits } from "./entry-math.ts";
import { matchLevel, normalizeName } from "./rank.ts";
import type { EntryUnit, Food } from "./diary-types.ts";

export type SpokenUnit = "g" | "ml" | "oz" | "serving";

export interface SpokenItem {
  quantity: number;
  unit: SpokenUnit | null;
  name: string;
  /** A household measure that was heard ("cup", "slice"); the amount still needs choosing. */
  measure?: string;
}

const SMALL: Record<string, number> = {
  zero: 0, a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  couple: 2, dozen: 12,
};
const FRACTIONS: Record<string, number> = { half: 0.5, quarter: 0.25, third: 1 / 3 };

// Unit word -> unit and a factor into that unit.
const UNITS: Record<string, { unit: SpokenUnit; factor: number }> = {
  g: { unit: "g", factor: 1 }, gram: { unit: "g", factor: 1 }, grams: { unit: "g", factor: 1 }, gm: { unit: "g", factor: 1 }, grammes: { unit: "g", factor: 1 },
  kg: { unit: "g", factor: 1000 }, kilo: { unit: "g", factor: 1000 }, kilos: { unit: "g", factor: 1000 }, kilogram: { unit: "g", factor: 1000 }, kilograms: { unit: "g", factor: 1000 },
  ml: { unit: "ml", factor: 1 }, milliliter: { unit: "ml", factor: 1 }, milliliters: { unit: "ml", factor: 1 }, millilitre: { unit: "ml", factor: 1 }, millilitres: { unit: "ml", factor: 1 },
  l: { unit: "ml", factor: 1000 }, liter: { unit: "ml", factor: 1000 }, liters: { unit: "ml", factor: 1000 }, litre: { unit: "ml", factor: 1000 }, litres: { unit: "ml", factor: 1000 },
  oz: { unit: "oz", factor: 1 }, ounce: { unit: "oz", factor: 1 }, ounces: { unit: "oz", factor: 1 },
  serving: { unit: "serving", factor: 1 }, servings: { unit: "serving", factor: 1 }, scoop: { unit: "serving", factor: 1 }, scoops: { unit: "serving", factor: 1 },
  portion: { unit: "serving", factor: 1 }, portions: { unit: "serving", factor: 1 },
};
const MEASURES = new Set(["cup", "cups", "bowl", "bowls", "slice", "slices", "piece", "pieces", "plate", "plates", "glass", "glasses", "handful", "handfuls", "tablespoon", "tablespoons", "tbsp", "teaspoon", "teaspoons", "tsp", "can", "cans", "bottle", "bottles", "bar", "bars"]);
// "bar" is a measure only when a food word follows ("a bar of chocolate"); "protein bar" keeps it in the name.
const LEAD_FILLER = /^(?:(?:so|okay|ok|um+|uh+|er+|well|and|then|also)\s+)*(?:(?:i\s+(?:just\s+)?(?:had|ate|have|drank|eaten)|i've\s+had|log|add|ate|had|drank)\b)?\s*/;
const TRAIL_FILLER = /\s+(?:for|at|with)\s+(?:breakfast|lunch|dinner|supper|a\s+snack|snack|brunch)$|\s+(?:today|this\s+morning|tonight|just\s+now)$/;
const NOISE = new Set(["um", "umm", "uh", "uhh", "er", "erm", "like", "okay", "ok", "so", "and", "the", "some", "please", "yeah", "hmm"]);

function singularMeasure(w: string): string {
  if (w === "glasses") return "glass";
  if (w === "tbsp" || w === "tablespoons") return "tablespoon";
  if (w === "tsp" || w === "teaspoons") return "teaspoon";
  return w.endsWith("s") ? w.slice(0, -1) : w;
}

/** A number at the start of `words`: digits, "1/2", number words ("two hundred"), "half", "a half", "half a". */
function readQuantity(words: string[]): { value: number; used: number } | null {
  let i = 0;
  let value: number | null = null;
  const w0 = words[0];
  if (w0 === undefined) return null;
  const frac = /^(\d+)\/(\d+)$/.exec(w0);
  if (frac && Number(frac[2]) > 0) {
    value = Number(frac[1]) / Number(frac[2]);
    i = 1;
  } else if (/^\d+(?:\.\d+)?$/.test(w0)) {
    value = Number(w0);
    i = 1;
  } else if (w0 in FRACTIONS) {
    value = FRACTIONS[w0];
    i = 1;
    if (words[1] === "a" || words[1] === "an" || words[1] === "of") i = words[2] === "a" || words[2] === "an" ? 3 : 2; // "half a", "half of a"
  } else if ((w0 === "a" || w0 === "an") && words[1] !== undefined && words[1] in FRACTIONS) {
    value = FRACTIONS[words[1]];
    i = 2;
    if (words[2] === "of" || words[2] === "a" || words[2] === "an") i = 3;
  } else if (w0 in SMALL) {
    value = SMALL[w0];
    i = 1;
    // "twenty five", "two hundred", "a couple of"
    if (value >= 20 && value % 10 === 0 && words[1] !== undefined && SMALL[words[1]] !== undefined && SMALL[words[1]] < 10 && SMALL[words[1]] > 0 && words[1] !== "a" && words[1] !== "an") {
      value += SMALL[words[1]];
      i = 2;
    }
    if (words[i] === "hundred") {
      value *= 100;
      i += 1;
      if (words[i] === "and") i += 1;
      const rest = words[i] !== undefined && words[i] !== "a" && words[i] !== "an" ? SMALL[words[i]] : undefined;
      if (rest !== undefined && rest > 0) {
        value += rest;
        i += 1;
        if (rest >= 20 && words[i] !== undefined && SMALL[words[i]] !== undefined && SMALL[words[i]] < 10 && SMALL[words[i]] > 0 && words[i] !== "a" && words[i] !== "an") {
          value += SMALL[words[i]];
          i += 1;
        }
      }
    }
    if (w0 === "couple" || w0 === "dozen") {
      if (words[i] === "of") i += 1;
    }
  } else if (w0 === "a" && (words[1] === "couple" || words[1] === "dozen")) {
    value = SMALL[words[1]];
    i = 2;
    if (words[2] === "of") i = 3;
  }
  if (value === null) return null;
  if (words[i] === "_half_") {
    value += 0.5;
    i += 1;
  }
  return { value, used: i };
}

function parsePart(part: string): SpokenItem | null {
  let text = part.trim().replace(LEAD_FILLER, "").replace(TRAIL_FILLER, "").trim();
  if (!text) return null;
  // "200g" -> "200 g"
  text = text.replace(/(\d)(g|kg|ml|l|oz)\b/g, "$1 $2");
  let words = text.split(/\s+/).filter(Boolean);
  let quantity = 1;
  let unit: SpokenUnit | null = null;
  let measure: string | undefined;
  const q = readQuantity(words);
  if (q) {
    quantity = q.value;
    words = words.slice(q.used);
  }
  const u = words[0] !== undefined ? UNITS[words[0]] : undefined;
  if (u && words.length > 1) {
    unit = u.unit;
    quantity *= u.factor;
    words = words.slice(1);
  } else if (words[0] !== undefined && MEASURES.has(words[0]) && words.length > 1 && (words[1] === "of" || !["bar", "bars"].includes(words[0]))) {
    measure = singularMeasure(words[0]);
    words = words.slice(1);
  }
  if (words[0] === "of") words = words.slice(1);
  if (words[0] === "a" || words[0] === "an") words = words.slice(1);
  const name = words.filter((w) => w !== "_half_").join(" ").trim();
  const meaningful = name.split(" ").filter((w) => !NOISE.has(w) && /[a-z]/.test(w));
  if (meaningful.length === 0 || meaningful.join("").length < 2) return null;
  if (!(quantity > 0) || !Number.isFinite(quantity)) return null;
  const item: SpokenItem = { quantity: Math.round(quantity * 100) / 100, unit, name };
  if (measure) item.measure = measure;
  return item;
}

/** Items heard in `text`, in the order spoken. Junk or silence gives []. */
export function parseSpokenFood(text: string): SpokenItem[] {
  if (typeof text !== "string") return [];
  const clean = text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9.,/'\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/(\d),(\d{3})\b/g, "$1$2")
    .replace(/\band a half\b/g, "_half_")
    .replace(/\bhundred and (?=(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b)/g, "hundred ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return [];
  const parts = clean.split(/\s*[,;]\s*|\s+(?:and|plus|then|also|with)\s+|\.\s+|\.$/);
  const out: SpokenItem[] = [];
  for (const p of parts) {
    if (!p) continue;
    const item = parsePart(p);
    if (item) out.push(item);
  }
  return out;
}

/** "eggs" and "egg", "tomatoes" and "tomato" compare equal. */
function singular(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && /(?:oes|ches|shes|sses|xes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
const singularName = (s: string) => normalizeName(s).split(" ").map(singular).join(" ");

export interface RecentAmount {
  foodId: string | null;
  quantity: number;
  unit: EntryUnit;
}

export interface FoodMatch {
  item: SpokenItem;
  /** Best food on the phone, or null: search for `item.name` instead. */
  food: Food | null;
  /** The amount to log, or null when it has to be chosen by hand. */
  amount: { quantity: number; unit: EntryUnit } | null;
}

const OWN = new Set(["user", "recipe"]);

/** Foods on the phone that fit `name`, best first: close name, then recent, then your own foods. */
export function candidatesFor(name: string, foods: readonly Food[], recents: readonly RecentAmount[]): Food[] {
  const q = singularName(name);
  if (!q) return [];
  const recentRank = new Map<string, number>();
  recents.forEach((r, i) => {
    if (r.foodId && !recentRank.has(r.foodId)) recentRank.set(r.foodId, i);
  });
  const keyed: { food: Food; band: number; recent: number; own: number; level: number; len: number }[] = [];
  for (const food of foods) {
    if (food.archived) continue;
    const level = Math.min(matchLevel(singularName(food.name), q), matchLevel(food.name, name));
    if (level > 4) continue;
    keyed.push({
      food,
      band: level <= 1 ? 0 : level <= 3 ? 1 : 2,
      recent: recentRank.get(food.id) ?? Number.MAX_SAFE_INTEGER,
      own: OWN.has(food.source) ? 0 : 1,
      level,
      len: normalizeName(food.name).length,
    });
  }
  keyed.sort((a, b) => a.band - b.band || a.recent - b.recent || a.own - b.own || a.level - b.level || a.len - b.len);
  return keyed.map((k) => k.food);
}

/** The amount to log for `item` of `food`, or null if the words don't say it in a unit this food can take. */
export function amountFor(item: SpokenItem, food: Food, last: RecentAmount | null): { quantity: number; unit: EntryUnit } | null {
  const units = allowedUnits(food);
  if (item.measure) return last && units.includes(last.unit) ? { quantity: last.quantity, unit: last.unit } : null;
  if (item.unit === "serving" || item.unit === null) {
    if (units.includes("serving")) return { quantity: item.quantity, unit: "serving" };
    if (item.unit === null && last && units.includes(last.unit) && item.quantity === 1) return { quantity: last.quantity, unit: last.unit };
    return null;
  }
  if (units.includes(item.unit)) return { quantity: item.quantity, unit: item.unit };
  return null;
}

/** Match each spoken item to a food on the phone. Unmatched items keep their words for a search. */
export function matchFoods(items: readonly SpokenItem[], foods: readonly Food[], recents: readonly RecentAmount[]): FoodMatch[] {
  return items.map((item) => {
    const food = candidatesFor(item.name, foods, recents)[0] ?? null;
    if (!food) return { item, food: null, amount: null };
    const last = recents.find((r) => r.foodId === food.id) ?? null;
    return { item, food, amount: amountFor(item, food, last) };
  });
}
