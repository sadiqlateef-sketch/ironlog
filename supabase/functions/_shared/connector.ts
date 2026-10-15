// The Claude connector's tools, minus the database: what Claude may send,
// and turning that into a finished workout. The checks and cleaning are the
// same ones the photo/text import uses (toImportedWorkout in import.ts), so a
// workout told to Claude is saved exactly like an imported one.

import { z } from "zod";
import { rankMatches, toImportedWorkout, type LibraryExercise, type ParsedImport } from "./import.ts";
import { formatKg, type UnitSystem } from "./units.ts";

const SET_TYPES = ["warmup", "normal", "drop", "failure"] as const;
type SetType = (typeof SET_TYPES)[number];

export const MUSCLES = [
  "chest", "upper_back", "lats", "lower_back", "traps", "front_delts", "side_delts", "rear_delts",
  "biceps", "triceps", "forearms", "abs", "obliques", "quads", "hamstrings", "glutes", "adductors",
  "abductors", "calves", "neck",
] as const;
export const EQUIPMENT = [
  "barbell", "dumbbell", "kettlebell", "machine", "cable", "bodyweight", "band", "smith_machine",
  "ez_bar", "trap_bar", "other",
] as const;

// ---------- What Claude sends ----------

export const FindExercisesInput = z.object({
  query: z.string().max(100).optional().describe("Exercise name to look up, e.g. 'incline db press'. Leave out to list the whole library."),
});

export const LogWorkoutInput = z.object({
  title: z.string().max(80).optional().describe("Short name, e.g. 'Push day' or 'Legs'"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .describe("YYYY-MM-DD in the lifter's time zone. Leave out if they just finished the workout."),
  start_time: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/)
    .optional()
    .describe("HH:MM, 24-hour, local time, only if the lifter said when they started"),
  timezone: z.string().max(64).optional().describe("IANA time zone, e.g. 'America/New_York', if known"),
  duration_minutes: z.number().int().min(1).max(600).optional().describe("How long the workout took, if said"),
  unit: z.enum(["lb", "kg"]).describe("Unit the lifter gave the weights in"),
  notes: z.string().max(1000).optional(),
  exercises: z
    .array(
      z.object({
        exercise: z
          .string()
          .min(1)
          .max(80)
          .describe("The slug from find_exercises (best), or the exercise name as the lifter said it"),
        sets: z
          .array(
            z.object({
              weight: z.number().min(0).max(2000).nullable().optional().describe("Load per set in `unit`, decimals allowed (42.5). Null or 0 for bodyweight."),
              reps: z.number().int().min(0).max(999),
              set_type: z.enum(SET_TYPES).optional().describe("Default 'normal'"),
              rpe: z.number().min(1).max(10).optional().describe("Only if the lifter said it"),
            }),
          )
          .min(1)
          .max(30)
          .describe("One entry per set: '3x5 @ 225' is three entries"),
        notes: z.string().max(300).optional(),
        if_new: z
          .object({ primary_muscle: z.enum(MUSCLES), equipment: z.enum(EQUIPMENT) })
          .optional()
          .describe("Only for an exercise that isn't in the library: adds it as the lifter's own exercise"),
      }),
    )
    .min(1)
    .max(40),
});
export type LogWorkoutInput = z.infer<typeof LogWorkoutInput>;

export const RecentWorkoutsInput = z.object({
  limit: z.number().int().min(1).max(20).optional().describe("How many, newest first (default 5)"),
});

export const DeleteWorkoutInput = z.object({
  workout_id: z.string().uuid().describe("The id log_workout or recent_workouts gave"),
});

// ---------- Time ----------

/** Minutes to add to UTC to get local time in `tz` at that instant. */
function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60_000);
}

/** A local date and time in `tz` as a UTC instant (DST-safe). */
export function localToUtc(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const first = guess - tzOffsetMinutes(guess, tz) * 60_000;
  return guess - tzOffsetMinutes(first, tz) * 60_000;
}

export function localDate(utcMs: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(utcMs));
}

function validZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    throw new LogError(`"${tz}" isn't a time zone I know. Use an IANA name like "America/Chicago", or leave timezone out.`);
  }
}

// ---------- Planning a save ----------

export class LogError extends Error {}

export interface PlannedSet {
  weight_kg: number;
  reps: number;
  set_type: SetType;
  rpe: number | null;
}

export interface PlannedWorkout {
  name: string;
  start: Date;
  minutes: number;
  notes: string;
  exercises: {
    /** Null when a new exercise has to be created first (see `create`). */
    exercise_id: string | null;
    create: { name: string; slug: string; primary_muscle: (typeof MUSCLES)[number]; equipment: (typeof EQUIPMENT)[number] } | null;
    display_name: string;
    sets: PlannedSet[];
  }[];
}

export const slugify = (name: string) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Checks what Claude sent and works out exactly what to save. Throws a
 * LogError (shown to Claude, nothing saved) for anything it can't place,
 * such as an exercise that isn't in the library.
 */
export function planWorkout(
  input: LogWorkoutInput,
  ctx: { library: LibraryExercise[]; unit: UnitSystem; now: number },
): PlannedWorkout {
  const tz = validZone(input.timezone);
  const today = localDate(ctx.now, tz);
  if (input.date) {
    const d = new Date(`${input.date}T12:00:00Z`);
    if (Number.isNaN(+d) || d.toISOString().slice(0, 10) !== input.date) throw new LogError(`${input.date} isn't a real date.`);
    if (input.date > today) throw new LogError(`${input.date} is in the future (today is ${today}${input.timezone ? "" : " UTC"}). Only finished workouts can be logged.`);
  }
  if (input.start_time) {
    const [h, m] = input.start_time.split(":").map(Number);
    if (h > 23 || m > 59) throw new LogError(`${input.start_time} isn't a time. Use 24-hour HH:MM.`);
  }

  // Reuse the importer's cleaning: unit conversion, clamping, set types,
  // dropping empty sets, and matching names to the library.
  const parsed: ParsedImport = {
    is_workout: true,
    title: input.title ?? "",
    date: input.date ?? today,
    start_time: input.start_time ?? null,
    duration_minutes: input.duration_minutes ?? null,
    unit: input.unit,
    notes: input.notes ?? "",
    exercises: input.exercises.map((x) => ({
      name_as_written: x.exercise,
      slug: x.exercise.trim().toLowerCase(),
      notes: x.notes ?? "",
      sets: x.sets.map((s) => ({ weight: s.weight ?? null, unit: null, reps: s.reps, set_type: s.set_type ?? "normal", rpe: s.rpe ?? null })),
    })),
  };
  const cleaned = toImportedWorkout(parsed, { library: ctx.library, unit: ctx.unit, today });
  if (cleaned.exercises.length === 0) throw new LogError("Every set was empty (no reps and no weight), so there's nothing to save.");

  const byName = new Map(input.exercises.map((x) => [x.exercise.trim().slice(0, 80) || "Exercise", x]));
  const nameOf = new Map(ctx.library.map((e) => [e.id, e.name]));
  const unmatched: string[] = [];
  const exercises: PlannedWorkout["exercises"] = cleaned.exercises.map((x) => {
    if (x.exercise_id) return { exercise_id: x.exercise_id, create: null, display_name: nameOf.get(x.exercise_id) ?? x.name_as_written, sets: x.sets };
    const ifNew = byName.get(x.name_as_written)?.if_new;
    const name = x.name_as_written;
    if (!ifNew) {
      const close = rankMatches(name, ctx.library, 4).filter((m) => m.score >= 0.3);
      unmatched.push(
        `"${name}"` + (close.length ? ` (closest: ${close.map((m) => `${m.exercise.slug} = ${m.exercise.name}`).join("; ")})` : " (nothing close)"),
      );
      return { exercise_id: null, create: null, display_name: name, sets: x.sets };
    }
    const pretty = name.replace(/\b[a-z]/g, (c) => c.toUpperCase());
    return { exercise_id: null, create: { name: pretty, slug: slugify(pretty) || "exercise", ...ifNew }, display_name: pretty, sets: x.sets };
  });
  if (unmatched.length) {
    throw new LogError(
      `Nothing saved yet: these aren't in the lifter's exercise library: ${unmatched.join(", ")}. ` +
        "Use one of the closest slugs if it's the same movement, call find_exercises to look, " +
        "or, if it really is a different exercise, send it again with if_new (primary_muscle and equipment) to add it.",
    );
  }

  const totalSets = exercises.reduce((n, x) => n + x.sets.length, 0);
  // No length given: about 3 minutes a set, between 15 minutes and 2 hours.
  const minutes = cleaned.duration_minutes ?? Math.min(120, Math.max(15, Math.round(totalSets * 3)));
  let startMs: number;
  if (input.start_time) startMs = localToUtc(cleaned.date ?? today, input.start_time, tz);
  else if (!input.date || input.date === today) startMs = ctx.now - minutes * 60_000; // just finished
  else startMs = localToUtc(input.date, "12:00", tz); // an earlier day, time unknown: midday
  if (startMs + minutes * 60_000 > ctx.now + 5 * 60_000) {
    throw new LogError("That workout would end in the future. Check the date, start time and length.");
  }

  return {
    name: cleaned.title === "Imported workout" ? "Workout" : cleaned.title,
    start: new Date(startMs),
    minutes,
    notes: cleaned.notes,
    exercises,
  };
}

// ---------- Describing workouts back to Claude ----------

const SET_LABEL: Record<SetType, string> = { warmup: " (warm-up)", normal: "", drop: " (drop)", failure: " (to failure)" };

export function describeSet(s: { weight_kg: number; reps: number; set_type: SetType; rpe: number | null }, unit: UnitSystem): string {
  const load = s.weight_kg > 0 ? formatKg(s.weight_kg, unit) : "bodyweight";
  return `${load} x ${s.reps}${s.rpe ? ` @ RPE ${s.rpe}` : ""}${SET_LABEL[s.set_type]}`;
}

export function describeWorkout(
  w: { id: string; name: string; start: Date; minutes: number | null; source?: string; exercises: { display_name: string; sets: PlannedSet[] }[] },
  unit: UnitSystem,
  tz = "UTC",
): string {
  const when = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(w.start);
  const head = `${w.name} on ${when}${w.minutes ? `, ${w.minutes} min` : ""}${w.source ? ` [logged via ${w.source}]` : ""} (id ${w.id})`;
  const lines = w.exercises.map((x) => `- ${x.display_name}: ${x.sets.map((s) => describeSet(s, unit)).join(", ")}`);
  return [head, ...lines].join("\n");
}
