// Workout import: turn a screenshot from another app, a photo of handwritten
// notes, or pasted text into a finished workout. Claude reads it and names
// each exercise from your library; everything here checks and cleans that
// answer so a misread can never save nonsense (the app also shows a review
// screen before anything is saved).

import { z } from "zod";
import { LB_PER_KG, type UnitSystem } from "./units.ts";

export const MAX_IMAGES = 8;
const MAX_IMAGE_BASE64 = 6_000_000; // ~4.5 MB per image, under Claude's 5 MB limit

export const ImportRequest = z.object({
  images: z
    .array(
      z.object({
        media_type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
        data: z.string().min(16).max(MAX_IMAGE_BASE64),
      }),
    )
    .max(MAX_IMAGES)
    .default([]),
  text: z.string().max(20_000).default(""),
  /** The phone's date, so "today" and "Monday" mean the lifter's day. */
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((r) => r.images.length > 0 || r.text.trim().length > 0, { message: "Add a photo or some text" });
export type ImportRequest = z.infer<typeof ImportRequest>;

const SET_TYPES = ["warmup", "normal", "drop", "failure"] as const;
type SetType = (typeof SET_TYPES)[number];

/** What Claude returns. Numbers are as written; the server converts and clamps. */
export const importSchema = z.object({
  is_workout: z.boolean().describe("false if the input doesn't contain a strength workout at all"),
  title: z.string().describe("A short name, e.g. 'Push day' or the title shown in the source"),
  date: z.string().nullable().describe("YYYY-MM-DD if a date is shown or implied, else null"),
  start_time: z.string().nullable().describe("HH:MM 24-hour if a start time is shown, else null"),
  duration_minutes: z.number().nullable().describe("Workout length if shown, else null"),
  unit: z.enum(["lb", "kg", "unknown"]).describe("The weight unit the source uses"),
  notes: z.string().describe("Any notes written alongside the workout, else empty"),
  exercises: z.array(
    z.object({
      name_as_written: z.string(),
      slug: z.string().nullable().describe("The matching slug from the library, or null if none fits"),
      sets: z.array(
        z.object({
          weight: z.number().nullable().describe("Weight as written; null for bodyweight or not shown"),
          unit: z.enum(["lb", "kg"]).nullable().describe("Only if this set's unit differs from the workout's"),
          reps: z.number().nullable(),
          set_type: z.enum(SET_TYPES),
          rpe: z.number().nullable(),
        }),
      ),
      notes: z.string(),
    }),
  ),
});
export type ParsedImport = z.infer<typeof importSchema>;

export const IMPORT_SYSTEM_PROMPT = `You read strength-training workouts that someone already finished and turn them into structured data for a lifting log.

The input may be a screenshot from another fitness app (Strong, Hevy, JEFIT, Fitbod, Apple Fitness, a spreadsheet, etc.), a photo of handwritten notes, or pasted text. Read every exercise and every set, in order.

Rules:
- One entry per set. Expand shorthand: "3x5 @ 225" or "225 x5 x3" is three sets of 5 reps at 225. "5/5/4 @ 100" is three sets of 5, 5 and 4 reps. "135x10, 185x8" is two sets.
- Weight is the load as written, without converting units. For dumbbells written "per hand" keep the number as written. Bodyweight exercises get weight null unless extra load is shown ("+25").
- unit: what the source uses. Look for lb/lbs/kg labels or the app's unit. If nothing says, use "unknown".
- set_type: "warmup" when marked W/warm-up or clearly a ramp-up set the source labels as such; "drop" for drop sets; "failure" when marked F/failure/AMRAP to failure; otherwise "normal".
- rpe only if written (RPE 8, @8). Never invent RPE.
- Skip cardio, stretching and anything that isn't a set of an exercise with reps.
- If handwriting is unclear, give your best reading. Never invent sets or exercises that aren't there.
- slug: pick the exercise from the library that is the same movement (same equipment when the source says it). Names differ between apps: "Bench Press (Barbell)" is barbell bench press, "DB Row" is a dumbbell row, "RDL" is a Romanian deadlift. Use null when nothing in the library is the same movement; don't force a near miss.
- date: read it from the source. Relative words like "today" or "yesterday", and weekdays without a date, are relative to the "today" date you are given. If no date appears, null.
- Text may be spoken and turned into text by the phone: numbers can be spelled out ("two twenty five" is 225, "one thirty five" is 135) and gym words misheard ("dead lift", "bench pressed"). Read it the way a lifter meant it.
- Text may be a chat, one message per line starting "Message 1:", "Message 2:" and so on. Treat it as one workout. Later messages add to it or correct it: "actually bench was 185" changes the earlier bench weight, "forgot curls 3x12 at 30" adds curls, "drop the rows" removes rows. Return the workout as it stands after the last message.
- If the input has no strength workout in it, set is_workout to false and return no exercises.`;

export interface LibraryExercise {
  id: string;
  slug: string;
  name: string;
  aliases: string[];
  equipment: string;
  created_by: string | null;
}

export function buildImportPrompt(library: LibraryExercise[], today: string, text: string): string {
  const lines = library.map((e) => `${e.slug} | ${e.name}${e.aliases.length ? ` | also: ${e.aliases.slice(0, 4).join(", ")}` : ""}`);
  return [
    `Today is ${today}.`,
    "",
    "Exercise library (slug | name | other names):",
    ...lines,
    "",
    text.trim() ? `The workout as text:\n"""\n${text.trim()}\n"""` : "The workout is in the image(s) above.",
  ].join("\n");
}

// ---------- Matching ----------

const STOP = new Set(["the", "a", "with", "on", "of", "and"]);
const SYNONYMS: Record<string, string> = {
  db: "dumbbell", dbs: "dumbbell", dumbbells: "dumbbell", bb: "barbell", kb: "kettlebell", kettlebells: "kettlebell",
  ohp: "overhead press", rdl: "romanian deadlift", sldl: "stiff leg deadlift", bw: "bodyweight",
  ext: "extension", extensions: "extension", raises: "raise", curls: "curl", rows: "row", presses: "press",
  squats: "squat", lunges: "lunge", flyes: "fly", flies: "fly", pulldowns: "pulldown", pushups: "push up",
  pullups: "pull up", chinups: "chin up", dips: "dip", deadlifts: "deadlift", shrugs: "shrug",
};

/** Lowercase words with common gym shorthand spelled out. */
export function normalizeName(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[()[\]/,.\-_]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (SYNONYMS[w] ?? w).split(" "))
    .filter((w) => !STOP.has(w));
}

/**
 * Best library match for a name, by word overlap. Used when Claude's slug
 * isn't in the library. Returns null unless it's a confident match.
 */
export function matchByName(name: string, library: LibraryExercise[]): LibraryExercise | null {
  const want = new Set(normalizeName(name));
  if (want.size === 0) return null;
  let best: { e: LibraryExercise; score: number } | null = null;
  for (const e of library) {
    for (const candidate of [e.name, e.slug.replace(/-/g, " "), ...e.aliases]) {
      const have = new Set(normalizeName(candidate));
      if (have.size === 0) continue;
      let common = 0;
      for (const w of want) if (have.has(w)) common++;
      // Dice coefficient: 1 means the same words.
      const score = (2 * common) / (want.size + have.size);
      if (!best || score > best.score || (score === best.score && e.created_by && !best.e.created_by)) best = { e, score };
    }
  }
  return best && best.score >= 0.75 ? best.e : null;
}

// ---------- Cleaning Claude's answer ----------

export interface ImportedSet {
  weight_kg: number;
  reps: number;
  set_type: SetType;
  rpe: number | null;
}

export interface ImportedExercise {
  name_as_written: string;
  exercise_id: string | null;
  match: "claude" | "name" | "none";
  notes: string;
  sets: ImportedSet[];
}

export interface ImportedWorkout {
  title: string;
  date: string | null;
  start_time: string | null;
  duration_minutes: number | null;
  notes: string;
  /** The unit the source was written in, so the review screen can say so. */
  source_unit: "lb" | "kg" | null;
  exercises: ImportedExercise[];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function validDate(s: string | null, today: string): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(+d) || d.toISOString().slice(0, 10) !== s) return null;
  // A date after today is a misread (or the wrong year); let the lifter pick.
  if (s > today || s < "1990-01-01") return null;
  return s;
}

function validTime(s: string | null): string | null {
  const m = s?.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

export function toImportedWorkout(
  parsed: ParsedImport,
  ctx: { library: LibraryExercise[]; unit: UnitSystem; today: string },
): ImportedWorkout {
  // The lifter's own exercise wins over a built-in one with the same slug.
  const bySlug = new Map<string, LibraryExercise>();
  for (const e of ctx.library) if (!bySlug.has(e.slug) || e.created_by) bySlug.set(e.slug, e);
  const fallbackUnit: "lb" | "kg" = parsed.unit === "unknown" ? (ctx.unit === "imperial" ? "lb" : "kg") : parsed.unit;

  const exercises: ImportedExercise[] = [];
  for (const x of parsed.exercises.slice(0, 40)) {
    const sets: ImportedSet[] = [];
    for (const s of x.sets.slice(0, 30)) {
      const reps = Math.round(s.reps ?? 0);
      const raw = s.weight ?? 0;
      if (!(reps > 0) && !(raw > 0)) continue; // nothing was recorded for this set
      const unit = s.unit ?? fallbackUnit;
      const kg = unit === "lb" ? raw / LB_PER_KG : raw;
      sets.push({
        weight_kg: Math.round(clamp(Number.isFinite(kg) ? kg : 0, 0, 1000) * 1000) / 1000,
        reps: clamp(Number.isFinite(reps) ? reps : 0, 0, 999),
        set_type: SET_TYPES.includes(s.set_type) ? s.set_type : "normal",
        rpe: s.rpe != null && s.rpe >= 1 && s.rpe <= 10 ? Math.round(s.rpe * 2) / 2 : null,
      });
    }
    if (sets.length === 0) continue;
    const name = x.name_as_written.trim().slice(0, 80) || "Exercise";
    const viaSlug = x.slug ? bySlug.get(x.slug) : undefined;
    const viaName = viaSlug ? null : matchByName(name, [...bySlug.values()]);
    exercises.push({
      name_as_written: name,
      exercise_id: viaSlug?.id ?? viaName?.id ?? null,
      match: viaSlug ? "claude" : viaName ? "name" : "none",
      notes: x.notes.trim().slice(0, 300),
      sets,
    });
  }

  const minutes = parsed.duration_minutes;
  return {
    title: parsed.title.trim().slice(0, 80) || "Imported workout",
    date: validDate(parsed.date, ctx.today),
    start_time: validTime(parsed.start_time),
    duration_minutes: minutes != null && minutes > 0 && minutes <= 600 ? Math.round(minutes) : null,
    notes: parsed.notes.trim().slice(0, 1000),
    source_unit: parsed.unit === "unknown" ? null : parsed.unit,
    exercises,
  };
}
