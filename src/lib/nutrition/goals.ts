// Nutrition goals: what the user aims for each day, stored in users.nutrition_goals.
//
// Everything starts unset. A day's goal is built in a fixed order:
// base -> weekday override -> training-day delta -> phase percentage (bulk/cut;
// a deload week counts as maintain when that setting is on). Every number here
// is the user's own setting; the few defaults (caffeine half-life, banking cap)
// are app settings the user can change, not advice.
// Pure, no app imports.

export type MacroMode = "grams" | "percent";
export type PhaseMode = "bulk" | "cut" | "maintain";

/** Energy in kcal; protein/carbs/fat in g, or in % of energy when mode is "percent". */
export interface BaseGoal {
  energy: number;
  mode: MacroMode;
  protein: number;
  carbs: number;
  fat: number;
}

export interface TrainingDelta {
  energyDelta: number;
  carbsDelta: number;
  proteinDelta: number;
}

export interface PhaseSettings {
  byProgram: Record<string, PhaseMode>;
  /** % more energy on a bulk. 0 until the user sets it. */
  bulkPct: number;
  /** % less energy on a cut. 0 until the user sets it. */
  cutPct: number;
  deloadAsMaintain: boolean;
}

/** fiber/sugarsMax in g, sodiumMax/caffeineMax in mg, water in ml. */
export interface MicroGoals {
  fiber?: number;
  sugarsMax?: number;
  sodiumMax?: number;
  caffeineMax?: number;
  water?: number;
}

export interface Supplement {
  id: string;
  name: string;
  dose: string;
  /** "HH:MM" times a dose is due. */
  times: string[];
}

export interface NutritionGoals {
  version: 1;
  base: BaseGoal | null;
  /** 0 = Sunday ... 6 = Saturday. */
  weekdays: Partial<Record<number, Partial<BaseGoal>>>;
  training: TrainingDelta | null;
  phase: PhaseSettings;
  micros: MicroGoals;
  banking: { on: boolean; maxBoostPct: number };
  hydration: { countDrinks: boolean };
  /** thresholdMg: the caffeine level (mg) the user wants to be under at sleep; null = no cutoff shown. */
  caffeine: { halfLifeH: number; sleepAt: string; thresholdMg: number | null };
  supplements: Supplement[];
  /** Protein (g) a meal must reach to count toward the protein spread; null = hidden. */
  proteinPerMeal: number | null;
}

/** App setting, user-editable: caffeine half-life in hours. Not advice. */
export const DEFAULT_HALF_LIFE_H = 5;
/** App setting, user-editable: most a banked surplus may raise one day's goal (%). */
export const DEFAULT_MAX_BOOST_PCT = 20;
export const DEFAULT_SLEEP_AT = "23:00";
/** Pre-fill for the editor only ("A starting point. Change it to yours."). */
export const STARTER_BASE: Readonly<BaseGoal> = { energy: 2000, mode: "percent", protein: 20, carbs: 50, fat: 30 };

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
export const MAX_SUPPLEMENTS = 20;

export function emptyGoals(): NutritionGoals {
  return {
    version: 1,
    base: null,
    weekdays: {},
    training: null,
    phase: { byProgram: {}, bulkPct: 0, cutPct: 0, deloadAsMaintain: true },
    micros: {},
    banking: { on: false, maxBoostPct: DEFAULT_MAX_BOOST_PCT },
    hydration: { countDrinks: false },
    caffeine: { halfLifeH: DEFAULT_HALF_LIFE_H, sleepAt: DEFAULT_SLEEP_AT, thresholdMg: null },
    supplements: [],
    proteinPerMeal: null,
  };
}

const obj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const num = (x: unknown, min: number, max: number): number | undefined =>
  typeof x === "number" && Number.isFinite(x) && x >= min && x <= max ? x : undefined;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeBase(raw: unknown): BaseGoal | null {
  const o = obj(raw);
  if (!o) return null;
  const energy = num(o.energy, 1, 20000);
  const mode: MacroMode = o.mode === "grams" ? "grams" : o.mode === "percent" ? "percent" : "grams";
  const max = mode === "percent" ? 100 : 2000;
  const protein = num(o.protein, 0, max);
  const carbs = num(o.carbs, 0, max);
  const fat = num(o.fat, 0, max);
  if (energy === undefined || protein === undefined || carbs === undefined || fat === undefined) return null;
  return { energy, mode, protein, carbs, fat };
}

function normalizePartialBase(raw: unknown): Partial<BaseGoal> | null {
  const o = obj(raw);
  if (!o) return null;
  const out: Partial<BaseGoal> = {};
  const energy = num(o.energy, 1, 20000);
  if (energy !== undefined) out.energy = energy;
  if (o.mode === "grams" || o.mode === "percent") out.mode = o.mode;
  for (const k of ["protein", "carbs", "fat"] as const) {
    const v = num(o[k], 0, 2000);
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Any stored value -> a full goals object; anything unknown or invalid is unset. */
export function normalizeGoals(raw: unknown): NutritionGoals {
  const g = emptyGoals();
  const o = obj(raw);
  if (!o) return g;
  g.base = normalizeBase(o.base);
  const wd = obj(o.weekdays);
  if (wd) {
    for (let d = 0; d <= 6; d++) {
      const p = normalizePartialBase(wd[String(d)]);
      if (p) g.weekdays[d] = p;
    }
  }
  const tr = obj(o.training);
  if (tr) {
    g.training = {
      energyDelta: num(tr.energyDelta, -5000, 5000) ?? 0,
      carbsDelta: num(tr.carbsDelta, -1000, 1000) ?? 0,
      proteinDelta: num(tr.proteinDelta, -1000, 1000) ?? 0,
    };
  }
  const ph = obj(o.phase);
  if (ph) {
    const by = obj(ph.byProgram) ?? {};
    for (const [k, v] of Object.entries(by)) if (v === "bulk" || v === "cut" || v === "maintain") g.phase.byProgram[k] = v;
    g.phase.bulkPct = num(ph.bulkPct, 0, 100) ?? 0;
    g.phase.cutPct = num(ph.cutPct, 0, 100) ?? 0;
    g.phase.deloadAsMaintain = ph.deloadAsMaintain !== false;
  }
  const mi = obj(o.micros);
  if (mi) {
    for (const k of ["fiber", "sugarsMax", "sodiumMax", "caffeineMax", "water"] as const) {
      const v = num(mi[k], 0.1, 100000);
      if (v !== undefined) g.micros[k] = v;
    }
  }
  const bk = obj(o.banking);
  if (bk) g.banking = { on: bk.on === true, maxBoostPct: num(bk.maxBoostPct, 0, 100) ?? DEFAULT_MAX_BOOST_PCT };
  const hy = obj(o.hydration);
  if (hy) g.hydration = { countDrinks: hy.countDrinks === true };
  const cf = obj(o.caffeine);
  if (cf) {
    g.caffeine = {
      halfLifeH: num(cf.halfLifeH, 0.5, 24) ?? DEFAULT_HALF_LIFE_H,
      sleepAt: typeof cf.sleepAt === "string" && HM.test(cf.sleepAt) ? cf.sleepAt : DEFAULT_SLEEP_AT,
      thresholdMg: num(cf.thresholdMg, 0, 2000) ?? null,
    };
  }
  if (Array.isArray(o.supplements)) {
    for (const s of o.supplements.slice(0, MAX_SUPPLEMENTS)) {
      const so = obj(s);
      if (!so || typeof so.id !== "string" || !so.id || so.id.length > 40) continue;
      const name = typeof so.name === "string" ? so.name.trim().slice(0, 60) : "";
      if (!name) continue;
      const times = Array.isArray(so.times) ? so.times.filter((t): t is string => typeof t === "string" && HM.test(t)).slice(0, 6) : [];
      g.supplements.push({ id: so.id, name, dose: typeof so.dose === "string" ? so.dose.slice(0, 40) : "", times: [...new Set(times)].sort() });
    }
  }
  g.proteinPerMeal = num(o.proteinPerMeal, 1, 500) ?? null;
  return g;
}

export interface MacroGrams {
  energy: number;
  protein: number;
  carbs: number;
  fat: number;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/** Macros in grams: % of energy at 4/4/9 kcal per g, or as entered. */
export function macroGrams(base: BaseGoal): MacroGrams {
  if (base.mode === "grams") return { energy: base.energy, protein: base.protein, carbs: base.carbs, fat: base.fat };
  return {
    energy: base.energy,
    protein: round1((base.energy * base.protein) / 100 / KCAL_PER_G.protein),
    carbs: round1((base.energy * base.carbs) / 100 / KCAL_PER_G.carbs),
    fat: round1((base.energy * base.fat) / 100 / KCAL_PER_G.fat),
  };
}

/** Percent goals should add to 100; returns the sum when they don't (null when fine or in grams). */
export function percentProblem(base: BaseGoal): number | null {
  if (base.mode !== "percent") return null;
  const sum = base.protein + base.carbs + base.fat;
  return Math.abs(sum - 100) < 0.5 ? null : sum;
}

export interface DayGoal extends MacroGrams {
  micros: MicroGoals;
  training: boolean;
  phase: PhaseMode | null;
  weekdayOverride: boolean;
}

export interface DayGoalContext {
  training?: boolean;
  phaseMode?: PhaseMode | null;
  deload?: boolean;
}

/** Weekday (0 = Sunday) of a "YYYY-MM-DD" day. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

/** The goal for one day, or null while no base goal is set. */
export function resolveDayGoal(goals: NutritionGoals, day: string, ctx: DayGoalContext = {}): DayGoal | null {
  if (!goals.base) return null;
  const override = goals.weekdays[weekdayOf(day)];
  const merged: BaseGoal = override ? { ...goals.base, ...override } : goals.base;
  // An override that switches mode without new macro numbers would misread them; keep the base's mode then.
  if (override?.mode && override.mode !== goals.base.mode && !("protein" in override && "carbs" in override && "fat" in override)) {
    merged.mode = goals.base.mode;
  }
  const g = macroGrams(merged);
  const training = !!ctx.training;
  if (training && goals.training) {
    g.energy += goals.training.energyDelta;
    g.carbs += goals.training.carbsDelta;
    g.protein += goals.training.proteinDelta;
  }
  let phase: PhaseMode | null = ctx.phaseMode ?? null;
  if (phase && ctx.deload && goals.phase.deloadAsMaintain) phase = "maintain";
  const pct = phase === "bulk" ? goals.phase.bulkPct : phase === "cut" ? -goals.phase.cutPct : 0;
  if (pct) {
    // Energy moves by the percentage; carbs and fat move with it, protein stays put.
    const f = 1 + pct / 100;
    g.energy *= f;
    g.carbs *= f;
    g.fat *= f;
  }
  return {
    energy: Math.max(0, Math.round(g.energy)),
    protein: Math.max(0, round1(g.protein)),
    carbs: Math.max(0, round1(g.carbs)),
    fat: Math.max(0, round1(g.fat)),
    micros: { ...goals.micros },
    training,
    phase,
    weekdayOverride: !!override,
  };
}
