// POST /functions/v1/generate-plan
// Body: PlanRequest (see _shared/program.ts). Creates a program with every
// workout mapped out (one routine per week and day) and returns it.

import { askStructured, checkDailyLimit, MODEL } from "../_shared/claude.ts";
import { askStructuredGemini, checkDailyLimitGemini, GEMINI_MODEL } from "../_shared/gemini.ts";
import { handle, HttpError, json, userClient } from "../_shared/http.ts";
import {
  buildPlanPrompt,
  PLAN_SYSTEM_PROMPT,
  PlanRequest,
  programSchema,
  toProgramWorkouts,
  type LiftHistory,
} from "../_shared/program.ts";
import type { UnitSystem } from "../_shared/units.ts";

Deno.serve(
  handle(async (req) => {
    const { db, userId } = await userClient(req);
    const parsed = PlanRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Please check the form and try again.");
    const input = parsed.data;
    if (input.provider === "gemini") {
      await checkDailyLimitGemini(userId, "generate_plan");
    } else {
      await checkDailyLimit(userId, "generate_plan");
    }

    // ---- Context: profile, exercise library, recent maxes ----
    const [{ data: profile }, { data: exercises, error: exErr }, { data: logged }] = await Promise.all([
      db.from("users").select("unit_system, physical_stats").eq("id", userId).single(),
      db.from("exercises").select("id, slug, name, primary_muscle, equipment, mechanic, created_by"),
      db.rpc("get_logged_exercises"),
    ]);
    if (exErr || !exercises?.length) throw new HttpError(500, "Couldn't load the exercise library.");
    const unit: UnitSystem = profile?.unit_system ?? "imperial";

    // The lifter's own custom exercise wins over a built-in one with the same slug.
    const bySlug = new Map<string, (typeof exercises)[number]>();
    for (const e of exercises) if (!bySlug.has(e.slug) || e.created_by) bySlug.set(e.slug, e);
    const allowed = new Set([...input.equipment, "bodyweight"]);
    const excluded = new Set(input.exclude_slugs);
    const library = [...bySlug.values()].filter(
      (e) => (input.equipment.length === 0 || allowed.has(e.equipment)) && !excluded.has(e.slug),
    );
    if (library.length < 3) throw new HttpError(400, "Not enough exercises match your equipment.");

    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    // Percent-of-max weights need the main lifts' maxes. Rank compound lifts
    // first so a split with many accessories can't crowd out the deadlift.
    const isCompound = (id: string) => exercises.find((e) => e.id === id)?.mechanic === "compound";
    const top = [...(logged ?? [])]
      .sort((a: { exercise_id: string }, b: { exercise_id: string }) => Number(isCompound(b.exercise_id)) - Number(isCompound(a.exercise_id)))
      .slice(0, 12);
    const lifts: LiftHistory[] = [];
    await Promise.all(
      top.map(async (l: { exercise_id: string; name: string }) => {
        const { data } = await db.rpc("get_e1rm_history", { p_exercise_id: l.exercise_id, p_since: since });
        const best = Math.max(0, ...(data ?? []).map((p: { e1rm: number }) => Number(p.e1rm)));
        const ex = exercises.find((e) => e.id === l.exercise_id);
        if (best > 0 && ex) lifts.push({ slug: ex.slug, name: l.name, e1rm_kg: best });
      }),
    );

    // ---- Ask Gemini or Claude ----
    const slugs = library.map((e) => e.slug) as [string, ...string[]];
    const planPrompt = buildPlanPrompt(input, {
      unit,
      physicalStats: (profile?.physical_stats as Record<string, unknown>) ?? {},
      lifts,
      library: library.map(({ slug, name, primary_muscle, equipment }) => ({ slug, name, primary_muscle, equipment })),
    });

    const isGemini = input.provider === "gemini";
    const program = isGemini
      ? await askStructuredGemini({
          userId,
          kind: "generate_plan",
          system: PLAN_SYSTEM_PROMPT,
          prompt: planPrompt,
          schema: programSchema(slugs),
        })
      : await askStructured({
          userId,
          kind: "generate_plan",
          system: PLAN_SYSTEM_PROMPT,
          prompt: planPrompt,
          schema: programSchema(slugs),
          effort: "high",
          maxTokens: 16000,
        });

    const workouts = toProgramWorkouts(
      program,
      {
        unit,
        exerciseIds: new Map(library.map((e) => [e.slug, e.id])),
        e1rmBySlug: new Map(lifts.map((l) => [l.slug, l.e1rm_kg])),
      },
      input.weeks,
      input.days_per_week,
    );
    if (workouts.length === 0) {
      throw new HttpError(502, `${isGemini ? "Gemini" : "Claude"}'s plan had no usable exercises. Please try again.`);
    }

    // ---- Save: the program, then one routine per week and day ----
    const { data: saved, error: pErr } = await db
      .from("programs")
      .insert({
        name: program.program_name.slice(0, 80),
        methodology: program.methodology.slice(0, 80),
        summary: program.summary.slice(0, 600),
        progression_rule: program.progression_rule.slice(0, 400),
        weeks: input.weeks,
        days_per_week: Math.max(...workouts.map((w) => w.day)),
        ai_generated: true,
        ai_metadata: { request: input, model: isGemini ? GEMINI_MODEL : MODEL, generated_at: new Date().toISOString() },
      })
      .select("id, name")
      .single();
    if (pErr || !saved) throw new HttpError(500, "Couldn't save the program.");
    const fail = async () => {
      await db.from("programs").delete().eq("id", saved.id); // routines go with it
      throw new HttpError(500, "Couldn't save the program.");
    };

    const { data: routines, error: rErr } = await db
      .from("routines")
      .insert(
        workouts.map((w) => ({
          name: `Week ${w.week} · ${w.name.slice(0, 70)}`,
          description: w.focus,
          ai_generated: true,
          program_id: saved.id,
          program_week: w.week,
          program_day: w.day,
        })),
      )
      .select("id, program_week, program_day");
    if (rErr || !routines) return await fail();

    const idOf = new Map(routines.map((r) => [`${r.program_week}/${r.program_day}`, r.id]));
    const { error: reErr } = await db
      .from("routine_exercises")
      .insert(workouts.flatMap((w) => w.rows.map((row) => ({ ...row, routine_id: idOf.get(`${w.week}/${w.day}`)! }))));
    if (reErr) return await fail();

    return json({ program_id: saved.id, program_name: saved.name, workouts: routines.length });
  }),
);
