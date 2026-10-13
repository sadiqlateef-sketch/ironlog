// POST /functions/v1/suggest-adjustments
// Body: { session_id }. After a workout started from a routine, compares what
// was logged with the plan and stores "next time" suggestions.

import { z } from "zod";
import {
  ADJUST_SYSTEM_PROMPT,
  AdjustmentOutput,
  clampSuggestion,
  ruleFor,
  type LoggedSet,
  type RuleResult,
} from "../_shared/adjust.ts";
import { askStructured, checkDailyLimit } from "../_shared/claude.ts";
import { handle, HttpError, json, userClient } from "../_shared/http.ts";
import type { UnitSystem } from "../_shared/units.ts";

const Body = z.object({ session_id: z.string().uuid() });
const LOWER = new Set(["quads", "hamstrings", "glutes", "adductors", "abductors", "calves", "lower_back"]);

Deno.serve(
  handle(async (req) => {
    const { db, userId } = await userClient(req);
    const body = Body.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Missing session_id");

    const { data: session } = await db
      .from("workout_sessions")
      .select("id, routine_id, end_time")
      .eq("id", body.data.session_id)
      .maybeSingle();
    if (!session) throw new HttpError(404, "Workout not found");
    if (!session.routine_id || !session.end_time) return json({ suggestions: [] });

    const [{ data: profile }, { data: targets }, { data: sets }, { data: routine }] = await Promise.all([
      db.from("users").select("unit_system").eq("id", userId).single(),
      db
        .from("routine_exercises")
        .select("id, exercise_id, position, target_sets, target_reps, target_reps_max, target_weight_kg, exercises(name, primary_muscle)")
        .eq("routine_id", session.routine_id)
        .order("position"),
      db
        .from("workout_sets")
        .select("exercise_id, exercise_order, set_type, weight, reps, is_completed")
        .eq("session_id", session.id)
        .eq("is_completed", true)
        .neq("set_type", "warmup")
        .order("set_number"),
      db
        .from("routines")
        .select("name, ai_metadata, program_week, programs(methodology, progression_rule, weeks)")
        .eq("id", session.routine_id)
        .single(),
    ]);
    const unit: UnitSystem = profile?.unit_system ?? "imperial";

    // Workouts started from a routine number exercises 1..n in routine order.
    const rules: RuleResult[] = [];
    (targets ?? []).forEach((t, i) => {
      const logged: LoggedSet[] = (sets ?? [])
        .filter((s) => s.exercise_order === i + 1 && s.exercise_id === t.exercise_id)
        .map((s) => ({ weight: Number(s.weight), reps: s.reps }));
      if (logged.length === 0) return; // skipped exercise: nothing to judge
      const ex = t.exercises as unknown as { name: string; primary_muscle: string } | null;
      const r = ruleFor(
        {
          routine_exercise_id: t.id,
          exercise_name: ex?.name ?? "Exercise",
          is_lower_body: LOWER.has(ex?.primary_muscle ?? ""),
          target_sets: t.target_sets,
          target_reps: t.target_reps,
          target_reps_max: t.target_reps_max,
          target_weight_kg: t.target_weight_kg == null ? null : Number(t.target_weight_kg),
        },
        logged,
        unit,
      );
      // "All sets in range, keep going" needs no card.
      if (!(r.action === "hold" && r.suggested_weight_kg == null)) rules.push(r);
    });
    if (rules.length === 0) return json({ suggestions: [] });

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
      const program = routine?.programs as unknown as { methodology: string | null; progression_rule: string | null; weeks: number } | null;
      const meta = { ...((routine?.ai_metadata ?? {}) as Record<string, unknown>), ...(program ?? {}) } as Record<string, unknown>;
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
    return json({ suggestions: saved });
  }),
);
