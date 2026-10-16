// POST /functions/v1/suggest-adjustments
// Body: { session_id }. After a workout started from a routine, compares what
// was logged with the plan and stores "next time" suggestions. In a program,
// it also offers a deload week when you keep missing your targets.

import { z } from "zod";
import {
  ADJUST_SYSTEM_PROMPT,
  AdjustmentOutput,
  clampSuggestion,
  earlyDeloadReason,
  judgeSession,
  needsEarlyDeload,
  type DoneSet,
  type PlannedExercise,
  type RuleResult,
} from "../_shared/adjust.ts";
import { askStructured, checkDailyLimit } from "../_shared/claude.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handle, HttpError, json, userClient } from "../_shared/http.ts";
import type { UnitSystem } from "../_shared/units.ts";

const Body = z.object({ session_id: z.string().uuid() });

const TARGET_COLUMNS = "id, routine_id, exercise_id, position, target_sets, target_reps, target_reps_max, target_weight_kg, exercises(name, primary_muscle)";
const SET_COLUMNS = "session_id, exercise_id, exercise_order, set_type, weight, reps, is_completed";

interface ProgramInfo {
  id: string;
  methodology: string | null;
  progression_rule: string | null;
  weeks: number;
  is_active: boolean;
  started_at: string | null;
  deload_suggestion: string | null;
  deload_checked_from: string | null;
}

Deno.serve(
  handle(async (req) => {
    const { db, userId } = await userClient(req);
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Missing session_id");

    const { data: session } = await db
      .from("workout_sessions")
      .select("id, routine_id, start_time, end_time")
      .eq("id", body.data.session_id)
      .maybeSingle();
    if (!session) throw new HttpError(404, "Workout not found");
    if (!session.routine_id || !session.end_time) return json({ suggestions: [] });

    const [{ data: profile }, { data: targets }, { data: sets }, { data: routine }] = await Promise.all([
      db.from("users").select("unit_system").eq("id", userId).single(),
      db.from("routine_exercises").select(TARGET_COLUMNS).eq("routine_id", session.routine_id).order("position"),
      db
        .from("workout_sets")
        .select(SET_COLUMNS)
        .eq("session_id", session.id)
        .eq("is_completed", true)
        .neq("set_type", "warmup")
        .order("set_number"),
      db
        .from("routines")
        .select(
          "name, ai_metadata, program_id, program_week, is_deload, programs(id, methodology, progression_rule, weeks, is_active, started_at, deload_suggestion, deload_checked_from)",
        )
        .eq("id", session.routine_id)
        .single(),
    ]);
    const unit: UnitSystem = profile?.unit_system ?? "imperial";

    // A deload week is light on purpose: nothing to judge.
    if (routine?.is_deload) return json({ suggestions: [], deload_week: true });

    const judged = judgeSession((targets ?? []) as unknown as PlannedExercise[], (sets ?? []) as DoneSet[], unit);
    const program = routine?.programs as unknown as ProgramInfo | null;

    // ---- Keep missing your targets? Offer a deload week now ----
    let early_deload: { program_id: string; reason: string } | null = null;
    if (program && routine?.program_week) {
      try {
        early_deload = await checkEarlyDeload(db, program, routine.program_week, session, judged, unit);
      } catch (e) {
        console.warn("adjustments: early deload check failed:", e instanceof Error ? e.message : e);
      }
    }

    // "All sets in range, keep going" needs no card.
    const rules = judged.filter((r) => !(r.action === "hold" && r.suggested_weight_kg == null));
    if (rules.length === 0) return json({ suggestions: [], early_deload });

    // ---- Ask Claude to refine; fall back to the rule if anything goes wrong ----
    const fromRule = (r: RuleResult) => ({
      routine_exercise_id: r.routine_exercise_id,
      action: r.action,
      current_weight_kg: r.current_weight_kg,
      suggested_weight_kg: r.suggested_weight_kg,
      suggested_reps: r.suggested_reps,
      suggested_reps_max: r.suggested_reps_max,
      reason: r.reason,
      source: "rules" as "ai" | "rules",
    });
    let final = rules.map(fromRule);
    try {
      await checkDailyLimit(userId, "adjust_session");
      // Programs keep their details on the program; older routines in ai_metadata.
      const meta = {
        ...((routine?.ai_metadata ?? {}) as Record<string, unknown>),
        ...(program ? { methodology: program.methodology, progression_rule: program.progression_rule } : {}),
      } as Record<string, unknown>;
      const inProgram = program && routine?.program_week
        ? `This was week ${routine.program_week} of a ${program.weeks}-week program. Applied changes carry to the same day in later weeks, which already progress as planned, so suggest a change only when performance clearly differs from the plan.\n`
        : "";
      const prompt = `Routine: ${routine?.name ?? "Workout"}${meta.methodology ? ` (${meta.methodology})` : ""}
${meta.progression_rule ? `Program progression rule: ${meta.progression_rule}\n` : ""}${inProgram}Lifter's unit: ${unit === "imperial" ? "pounds (round to 5 lb)" : "kilograms (round to 2.5 kg)"}

Exercises:
${rules
  .map((r) => `- id ${r.routine_exercise_id}: ${r.facts}. Baseline: ${r.action}${r.suggested_weight_kg ? ` to ${r.suggested_weight_kg} kg` : ""}. Current weight: ${r.current_weight_kg ?? "unknown"} kg.`)
  .join("\n")}`;
      const out = await askStructured({
        userId,
        kind: "adjust_session",
        system: ADJUST_SYSTEM_PROMPT,
        prompt,
        schema: AdjustmentOutput,
        effort: "medium",
        maxTokens: 8000,
      });
      final = rules.map((rule) => {
        const ai = out.suggestions.find((s) => s.routine_exercise_id === rule.routine_exercise_id);
        return ai ? { ...clampSuggestion(ai, rule, unit), source: "ai" as const } : fromRule(rule);
      });
    } catch (e) {
      // No key, daily limit, or API trouble: the rule-based suggestions still help.
      console.warn("adjustments: using rules only:", e instanceof Error ? e.message : e);
    }

    const { data: saved, error } = await db
      .from("routine_adjustments")
      .upsert(
        final.map((f) => ({ ...f, session_id: session.id, status: "pending" })),
        { onConflict: "session_id,routine_exercise_id" },
      )
      .select("*");
    if (error) throw new HttpError(500, "Couldn't save suggestions.");
    return json({ suggestions: saved, early_deload });
  }),
);

/**
 * Looks at this workout and the two before it in the same program (since it
 * started, the last deload, or the last "Not now"). When two of them were
 * rough, saves a deload offer on the program and returns it.
 */
async function checkEarlyDeload(
  db: SupabaseClient,
  program: ProgramInfo,
  week: number,
  session: { id: string; start_time: string },
  judged: RuleResult[],
  unit: UnitSystem,
): Promise<{ program_id: string; reason: string } | null> {
  if (program.deload_suggestion) return { program_id: program.id, reason: program.deload_suggestion };
  // Week 1 misses usually mean the starting weights were off; the per-exercise
  // suggestions fix that. A program in its last week just ends.
  if (!program.is_active || !program.started_at || week < 2 || week >= program.weeks) return null;
  if (!judged.some((r) => r.missed)) return null;

  // A deload already planned for this week or next will do the job.
  const { data: soon } = await db
    .from("routines")
    .select("id")
    .eq("program_id", program.id)
    .eq("is_deload", true)
    .gte("program_week", week)
    .lte("program_week", week + 1)
    .limit(1);
  if (soon?.length) return null;

  const since = [program.started_at, program.deload_checked_from].filter(Boolean).sort().at(-1)!;
  const { data: before } = await db
    .from("workout_sessions")
    .select("id, routine_id, start_time, routines!inner(program_id, is_deload)")
    .eq("routines.program_id", program.id)
    .not("end_time", "is", null)
    .gte("start_time", since)
    .lt("start_time", session.start_time)
    .neq("id", session.id)
    .order("start_time", { ascending: false })
    .limit(2);
  // Stop at a deload workout: misses before it were already dealt with.
  const earlierSessions: { id: string; routine_id: string }[] = [];
  for (const s of before ?? []) {
    if ((s.routines as unknown as { is_deload: boolean }).is_deload) break;
    earlierSessions.push(s);
  }
  if (earlierSessions.length === 0) return null;

  const [{ data: plan }, { data: done }] = await Promise.all([
    db.from("routine_exercises").select(TARGET_COLUMNS).in("routine_id", earlierSessions.map((s) => s.routine_id)).order("position"),
    db
      .from("workout_sets")
      .select(SET_COLUMNS)
      .in("session_id", earlierSessions.map((s) => s.id))
      .eq("is_completed", true)
      .neq("set_type", "warmup")
      .order("set_number"),
  ]);
  const earlier = earlierSessions.map((s) =>
    judgeSession(
      ((plan ?? []) as unknown as (PlannedExercise & { routine_id: string })[]).filter((t) => t.routine_id === s.routine_id),
      ((done ?? []) as (DoneSet & { session_id: string })[]).filter((x) => x.session_id === s.id),
      unit,
    ),
  );
  if (!needsEarlyDeload(judged, earlier)) return null;

  const reason = earlyDeloadReason(judged, earlier);
  const { error } = await db
    .from("programs")
    .update({ deload_suggestion: reason, deload_suggested_at: new Date().toISOString() })
    .eq("id", program.id);
  if (error) throw error;
  return { program_id: program.id, reason };
}
