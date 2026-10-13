// POST /functions/v1/generate-plan
// Body: PlanRequest (see _shared/program.ts). Creates one routine per training
// day, marked ai_generated, and returns them.

import { askStructured, checkDailyLimit, MODEL } from "../_shared/claude.ts";
import { handle, HttpError, json, userClient } from "../_shared/http.ts";
import {
  buildPlanPrompt,
  PLAN_SYSTEM_PROMPT,
  PlanRequest,
  programSchema,
  toRoutineRows,
  type LiftHistory,
} from "../_shared/program.ts";
import type { UnitSystem } from "../_shared/units.ts";

Deno.serve(
  handle(async (req) => {
    const { db, userId } = await userClient(req);
    const parsed = PlanRequest.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Please check the form and try again.");
    const input = parsed.data;
    await checkDailyLimit(userId, "generate_plan");

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
    const library = [...bySlug.values()].filter((e) => input.equipment.length === 0 || allowed.has(e.equipment));
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

    // ---- Ask Claude ----
    const slugs = library.map((e) => e.slug) as [string, ...string[]];
    const program = await askStructured({
      userId,
      kind: "generate_plan",
      system: PLAN_SYSTEM_PROMPT,
      prompt: buildPlanPrompt(input, {
        unit,
        physicalStats: (profile?.physical_stats as Record<string, unknown>) ?? {},
        lifts,
        library: library.map(({ slug, name, primary_muscle, equipment }) => ({ slug, name, primary_muscle, equipment })),
      }),
      schema: programSchema(slugs),
      effort: "high",
      maxTokens: 16000,
    });

    const days = toRoutineRows(program, {
      unit,
      exerciseIds: new Map(library.map((e) => [e.slug, e.id])),
      e1rmBySlug: new Map(lifts.map((l) => [l.slug, l.e1rm_kg])),
    }).slice(0, input.days_per_week);
    if (days.length === 0) throw new HttpError(502, "Claude's plan had no usable exercises. Please try again.");

    // ---- Save: one routine per day ----
    const programId = crypto.randomUUID();
    const { data: last } = await db.from("routines").select("position").order("position", { ascending: false }).limit(1);
    const start = (last?.[0]?.position ?? 0) + 1;
    const { data: routines, error: rErr } = await db
      .from("routines")
      .insert(
        days.map((d, i) => ({
          name: d.name,
          description: d.focus,
          ai_generated: true,
          position: start + i,
          ai_metadata: {
            program_id: programId,
            program_name: program.program_name.slice(0, 80),
            methodology: program.methodology.slice(0, 80),
            summary: program.summary.slice(0, 600),
            progression_rule: program.progression_rule.slice(0, 400),
            day_index: i + 1,
            request: input,
            model: MODEL,
            generated_at: new Date().toISOString(),
          },
        })),
      )
      .select("id, name, position");
    if (rErr || !routines) throw new HttpError(500, "Couldn't save the program.");

    const ordered = [...routines].sort((a, b) => a.position - b.position);
    const { error: reErr } = await db
      .from("routine_exercises")
      .insert(ordered.flatMap((r, i) => days[i].rows.map((row) => ({ ...row, routine_id: r.id }))));
    if (reErr) {
      await db.from("routines").delete().in("id", ordered.map((r) => r.id));
      throw new HttpError(500, "Couldn't save the program.");
    }

    return json({ program_id: programId, program_name: program.program_name, routines: ordered });
  }),
);
