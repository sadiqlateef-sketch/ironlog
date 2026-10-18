// Equipment kits: what a place actually has (your gym, your living room).
// Plans, swaps, the plate calculator and home workouts only use what's in
// the kit. Kits live on your profile (users.equipment_kits), weights in kg.
// No app imports here, so it can be unit tested.

import type { EquipmentType } from "../types/database";

export type KitKind = "gym" | "home";

/** A weight you own. `count` = how many of them; null = as many as you need (a gym). */
export interface KitWeight {
  kg: number;
  count: number | null;
}

export interface Kit {
  id: string;
  name: string;
  kind: KitKind;
  /** Equipment types here. Bodyweight moves are always allowed. */
  equipment: EquipmentType[];
  bench: boolean;
  rack: boolean;
  pullup_bar: boolean;
  /** The barbell's weight, if there is one. */
  bar_kg: number | null;
  /** Plate sizes; count is the total number of plates (two make a pair). */
  plates: KitWeight[];
  /** Dumbbells you own; null = a full rack. */
  dumbbells: KitWeight[] | null;
  /** Exercises this place doesn't have (marked from Swap). */
  missing: string[];
}

export type KitExercise = { id: string; slug: string; equipment: string; created_by?: string | null };

const LB = 0.45359237;
const lb = (n: number) => Math.round(n * LB * 1000) / 1000;

export const KIT_EQUIPMENT: EquipmentType[] = ["barbell", "dumbbell", "machine", "cable", "smith_machine", "kettlebell", "band", "ez_bar", "trap_bar"];
const DEFAULT_GYM_EQUIPMENT: EquipmentType[] = ["barbell", "dumbbell", "machine", "cable"];

/** The kit Sadiq described: one 20 lb and one 40 lb dumbbell, a standard bar and 100 lb of plates. */
export function defaultHomeKit(id = "home"): Kit {
  return {
    id,
    name: "Home",
    kind: "home",
    equipment: ["barbell", "dumbbell"],
    bench: false,
    rack: false,
    pullup_bar: false,
    // A 5 ft "standard" (1 inch) bar is about 15 lb.
    bar_kg: lb(15),
    plates: [
      { kg: lb(25), count: 2 },
      { kg: lb(10), count: 4 },
      { kg: lb(5), count: 2 },
    ],
    dumbbells: [
      { kg: lb(20), count: 1 },
      { kg: lb(40), count: 1 },
    ],
    missing: [],
  };
}

type ProfileLike = {
  bar_weight_kg: number;
  available_plates_kg: number[];
  training_equipment?: string[] | null;
  equipment_kits?: unknown;
  active_kit_id?: string | null;
};

/** Your gym as the app knew it before kits: the bar and plates from Settings. */
function legacyGym(p: ProfileLike | null): Kit {
  const equipment = (p?.training_equipment ?? []).filter((e): e is EquipmentType => (KIT_EQUIPMENT as string[]).includes(e));
  const plates = p?.available_plates_kg?.length ? p.available_plates_kg : [lb(45), lb(35), lb(25), lb(10), lb(5), lb(2.5)];
  return {
    id: "gym",
    name: "My gym",
    kind: "gym",
    equipment: equipment.length ? equipment : DEFAULT_GYM_EQUIPMENT,
    bench: true,
    rack: true,
    pullup_bar: true,
    bar_kg: Number(p?.bar_weight_kg ?? 20),
    plates: plates.map((kg) => ({ kg: Number(kg), count: null })),
    dumbbells: null,
    missing: [],
  };
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);

function weights(v: unknown): KitWeight[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((w) => ({ kg: num(w?.kg), count: w?.count == null ? null : Math.max(0, Math.round(Number(w.count) || 0)) }))
    .filter((w): w is KitWeight => w.kg != null && w.count !== 0);
}

/** Tidy up a kit read from the database (older or hand-edited rows can't break the app). */
export function normalizeKit(raw: unknown): Kit | null {
  if (!raw || typeof raw !== "object") return null;
  const k = raw as Record<string, unknown>;
  if (typeof k.id !== "string" || !k.id) return null;
  const kind: KitKind = k.kind === "home" ? "home" : "gym";
  return {
    id: k.id.slice(0, 40),
    name: (typeof k.name === "string" && k.name.trim()) || (kind === "home" ? "Home" : "Gym"),
    kind,
    equipment: (Array.isArray(k.equipment) ? k.equipment : []).filter((e): e is EquipmentType => (KIT_EQUIPMENT as unknown[]).includes(e)),
    bench: !!k.bench,
    rack: !!k.rack,
    pullup_bar: !!k.pullup_bar,
    bar_kg: num(k.bar_kg),
    plates: weights(k.plates),
    dumbbells: k.dumbbells == null ? null : weights(k.dumbbells),
    missing: (Array.isArray(k.missing) ? k.missing : []).filter((x): x is string => typeof x === "string"),
  };
}

/** Every kit you have. Without any saved yet, that's your gym from the old bar and plates settings. */
export function kitsOf(p: ProfileLike | null): Kit[] {
  const saved = Array.isArray(p?.equipment_kits) ? (p!.equipment_kits as unknown[]).map(normalizeKit).filter((k): k is Kit => !!k) : [];
  return saved.some((k) => k.kind === "gym") ? saved : [legacyGym(p), ...saved];
}

/** The kit you're using now: the one you picked, else your first gym. */
export function activeKit(p: ProfileLike | null, kits = kitsOf(p)): Kit {
  return kits.find((k) => k.id === p?.active_kit_id) ?? kits.find((k) => k.kind === "gym") ?? kits[0];
}

export function homeKit(kits: Kit[]): Kit | null {
  return kits.find((k) => k.kind === "home") ?? null;
}

/** The kit a workout uses: the one it was started with, else whatever's active. */
export function kitFor(kitId: string | null | undefined, p: ProfileLike | null): Kit {
  const kits = kitsOf(p);
  return kits.find((k) => k.id === kitId) ?? activeKit(p, kits);
}

/** Bar and plate fields to keep on the profile too, so the watch and older screens agree with your gym. */
export function legacyFields(kit: Kit): { bar_weight_kg: number; available_plates_kg: number[] } | null {
  if (kit.kind !== "gym" || kit.bar_kg == null || !kit.plates.length) return null;
  return { bar_weight_kg: kit.bar_kg, available_plates_kg: [...new Set(kit.plates.map((p) => p.kg))].sort((a, b) => b - a) };
}

// ---------- What an exercise needs ----------

export type Need = "bench" | "rack" | "pullup_bar" | "two_dumbbells";

const BENCH = /bench|incline|decline|preacher|pullover|hip-thrust|tate-press|bench-dips|jm-press|guillotine/;
const RACK = /squat|bench-press|good-morning|rack|pin-press|board-press|lunge|step-ups|split-squat/;
const BAR = /pull-?up|chin|hanging|muscle-up|toes-to-bar|^dip$|parallel-bar|captains-chair|knee-hip-raise/;
const NO_RACK = /^(front-squat|front-squat-clean-grip|overhead-squat|zercher-squats|floor-press|one-arm-floor-press)$/;

/** Dumbbell moves done with a single dumbbell, so one of each weight is enough. */
const ONE_DUMBBELL = new Set([
  "dumbbell-row", "bulgarian-split-squat", "dumbbell-step-ups", "dumbbell-rear-lunge", "dumbbell-lunges", "plie-dumbbell-squat",
  "standing-dumbbell-triceps-extension", "seated-triceps-press", "calf-raise-on-a-dumbbell", "dumbbell-side-bend",
  "straight-arm-dumbbell-pullover", "bent-arm-dumbbell-pullover", "farmers-carry", "single-dumbbell-raise",
  "standing-concentration-curl", "concentration-curls", "dumbbell-squat-to-a-bench", "stiff-legged-dumbbell-deadlift",
  "standing-dumbbell-calf-raise", "tricep-dumbbell-kickback", "cross-body-hammer-curl",
]);
const ONE_DUMBBELL_NAME = /one-arm|one-leg|single-|-single|concentration/;

/** Kettlebell moves you can do just as well holding a dumbbell. */
const KETTLEBELL_WITH_DUMBBELL = new Set([
  "goblet-squat", "one-arm-kettlebell-swings", "kettlebell-one-legged-deadlift", "one-arm-kettlebell-row",
  "one-arm-kettlebell-floor-press", "kettlebell-halo", "kettlebell-overhead-triceps-extension",
]);

export function oneDumbbellOk(slug: string): boolean {
  return ONE_DUMBBELL.has(slug) || ONE_DUMBBELL_NAME.test(slug) || KETTLEBELL_WITH_DUMBBELL.has(slug);
}

/** What else an exercise needs besides its main equipment. */
export function needsOf(e: KitExercise): Need[] {
  const s = e.slug;
  const out: Need[] = [];
  if (BENCH.test(s) && !/floor/.test(s)) out.push("bench");
  if (["barbell", "ez_bar"].includes(e.equipment) && RACK.test(s) && !NO_RACK.test(s) && !/bench-press/.test(s) && !/deadlift|bridge/.test(s)) out.push("rack");
  if (e.equipment === "barbell" && /bench-press/.test(s) && !/floor/.test(s)) out.push("rack");
  if (["bodyweight", "other"].includes(e.equipment) && BAR.test(s)) out.push("pullup_bar");
  if (e.equipment === "dumbbell" && !oneDumbbellOk(s)) out.push("two_dumbbells");
  return [...new Set(out)];
}

/** Two dumbbells of the same weight (or a full rack)? */
export function hasPair(kit: Kit): boolean {
  return kit.dumbbells == null || kit.dumbbells.some((d) => d.count == null || d.count >= 2);
}

/** Can you do this exercise with this kit? */
export function kitAllows(e: KitExercise, kit: Kit): boolean {
  if (kit.missing.includes(e.id)) return false;
  const has = (t: string) => (kit.equipment as string[]).includes(t);
  const dumbbells = has("dumbbell") && (kit.dumbbells == null || kit.dumbbells.length > 0);
  const type = e.equipment;
  const typeOk =
    type === "bodyweight" ||
    (type === "dumbbell" ? dumbbells : type === "kettlebell" ? has("kettlebell") || (dumbbells && KETTLEBELL_WITH_DUMBBELL.has(e.slug)) : type === "other" ? kit.kind === "gym" || BAR.test(e.slug) : has(type));
  if (!typeOk) return false;
  if (type === "barbell" && kit.bar_kg == null) return false;
  for (const n of needsOf(e)) {
    if (n === "two_dumbbells" ? !hasPair(kit) : !kit[n]) return false;
  }
  return true;
}

// ---------- Weights ----------

/** Dumbbell weights you own, lightest first (null = a full rack). */
export function dumbbellWeights(kit: Kit): number[] | null {
  return kit.dumbbells == null ? null : [...new Set(kit.dumbbells.map((d) => d.kg))].sort((a, b) => a - b);
}

/** Heaviest the barbell can be loaded, in kg (null = no limit, a gym). */
export function maxBarbellKg(kit: Kit): number | null {
  if (kit.bar_kg == null) return null;
  if (kit.plates.some((p) => p.count == null)) return null;
  return kit.bar_kg + kit.plates.reduce((t, p) => t + p.kg * 2 * Math.floor((p.count ?? 0) / 2), 0);
}

/** A sentence about the weights, for Claude when it builds a plan. */
export function describeKit(kit: Kit, unit: "metric" | "imperial"): string {
  const w = (kg: number) => (unit === "imperial" ? `${Math.round((kg / LB) * 2) / 2} lb` : `${Math.round(kg * 4) / 4} kg`);
  const parts: string[] = [];
  const dbs = dumbbellWeights(kit);
  if (dbs) parts.push(`dumbbells: ${kit.dumbbells!.map((d) => `${d.count ?? "pair of"}× ${w(d.kg)}`).join(", ")}${hasPair(kit) ? "" : " (single dumbbells only, so one-dumbbell or one-arm moves)"}`);
  const max = maxBarbellKg(kit);
  if (max != null) parts.push(`barbell loads up to ${w(max)}`);
  const missing = [!kit.bench && "no bench", !kit.rack && "no squat rack", !kit.pullup_bar && "no pull-up bar"].filter(Boolean);
  if (missing.length) parts.push(missing.join(", "));
  return parts.join("; ");
}
