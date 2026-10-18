// Database calls for the Progress insights: goals, bodyweight, heart rate,
// set effort (RPE) and weekly recaps. Row Level Security keeps every query to
// the signed-in user's rows.

import { getSupabase } from "@/lib/supabase/client";
import { weekStart } from "@/lib/stats";
import { localDay } from "@/lib/body";
import type { Exercise, ExercisePrefs } from "@/lib/workout-api";
import type { Tables } from "@/types/database";

export type WeeklyRecapRow = Tables<"weekly_recaps">;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type Goal = ExercisePrefs & { exercises: Pick<Exercise, "id" | "name" | "slug"> | null };

/** Every lift you've set a goal for. */
export async function listGoals(): Promise<Goal[]> {
  const rows = unwrap(
    await getSupabase().from("exercise_prefs").select("*, exercises(id, name, slug)").not("goal_weight_kg", "is", null).order("goal_date", { nullsFirst: false }),
  );
  return rows as unknown as Goal[];
}

/** Your newest logged bodyweight (kg), else the one in your profile. */
export async function latestBodyweightKg(fallback: number | null | undefined): Promise<{ kg: number; on: string | null } | null> {
  const row: { measured_on: string; weight_kg: number | null } | null = unwrap(
    await getSupabase()
      .from("body_measurements")
      .select("measured_on, weight_kg")
      .not("weight_kg", "is", null)
      .order("measured_on", { ascending: false })
      .limit(1)
      .maybeSingle(),
  );
  if (row?.weight_kg) return { kg: Number(row.weight_kg), on: row.measured_on };
  return fallback ? { kg: fallback, on: null } : null;
}

export type HrRow = { session_id: string; recorded_at: string; bpm: number };

/** Heart-rate samples from the watch (or Health Connect) for these workouts. */
export async function listHeartRate(sessionIds: string[]): Promise<HrRow[]> {
  const out: HrRow[] = [];
  for (let i = 0; i < sessionIds.length; i += 100) {
    const ids = sessionIds.slice(i, i + 100);
    for (let from = 0; ; from += 1000) {
      const rows: HrRow[] = unwrap(
        await getSupabase()
          .from("heart_rate_samples")
          .select("session_id, recorded_at, bpm")
          .in("session_id", ids)
          .order("id")
          .range(from, from + 999),
      );
      out.push(...rows);
      if (rows.length < 1000) break;
    }
  }
  return out;
}

export type EffortSet = { session_id: string; set_type: string; reps: number; rpe: number | null };

/** Finished sets with their RPE, for the strain score. */
export async function listEffortSets(sessionIds: string[]): Promise<EffortSet[]> {
  const out: EffortSet[] = [];
  for (let i = 0; i < sessionIds.length; i += 100) {
    const rows = unwrap(
      await getSupabase()
        .from("workout_sets")
        .select("session_id, set_type, reps, rpe")
        .in("session_id", sessionIds.slice(i, i + 100))
        .eq("is_completed", true),
    );
    out.push(...rows.map((r) => ({ ...r, rpe: r.rpe == null ? null : Number(r.rpe) })));
  }
  return out;
}

// ---------- Weekly recap ----------

/** Recaps unlock at 6 PM on Sunday. */
export const RECAP_HOUR = 18;

/**
 * The week whose recap to show: this week from Sunday 6 PM, otherwise last
 * week. Returns its Monday as yyyy-mm-dd plus whether it's ready yet.
 */
export function recapWeek(now = Date.now()): { weekStart: string; monday: number } {
  const d = new Date(now);
  const sundayEvening = d.getDay() === 0 && d.getHours() >= RECAP_HOUR;
  const thisMonday = weekStart(now);
  const monday = sundayEvening ? thisMonday : weekStart(thisMonday - 86_400_000);
  return { weekStart: localDay(new Date(monday)), monday };
}

export async function getWeeklyRecap(week: string): Promise<WeeklyRecapRow | null> {
  return unwrap(await getSupabase().from("weekly_recaps").select("*").eq("week_start", week).maybeSingle());
}

/** Writes the recap (Claude, or rules as a fallback) if it doesn't exist yet, and returns it. */
export async function makeWeeklyRecap(week: string): Promise<WeeklyRecapRow> {
  const [y, m, d] = week.split("-").map(Number);
  const tz = new Date(y, m - 1, d).getTimezoneOffset();
  const { data, error } = await getSupabase().functions.invoke("weekly-recap", { body: { week_start: week, tz_offset_min: tz } });
  if (error) {
    let msg = error.message;
    try {
      msg = (await (error as { context?: Response }).context?.json())?.error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return data as WeeklyRecapRow;
}
