// POST /functions/v1/weekly-recap
// Body: { week_start: "yyyy-mm-dd" (Monday, local), tz_offset_min }. Returns
// that week's recap, writing it the first time it's asked for (from Sunday
// on). Claude writes it when it can; otherwise rules do. One per week, so
// opening the app again never costs another Claude call.

import { askStructured, checkDailyLimit } from "../_shared/claude.ts";
import { adminClient, handle, HttpError, json, userClient } from "../_shared/http.ts";
import {
  factsPrompt,
  RECAP_SYSTEM_PROMPT,
  RecapOutput,
  RecapRequest,
  recapFacts,
  rulesRecap,
  tidyRecap,
  weekStartInstant,
  type RecapSession,
  type RecapSet,
  type RecapText,
} from "../_shared/recap.ts";
import type { UnitSystem } from "../_shared/units.ts";

const DAY = 86_400_000;

Deno.serve(
  handle(async (req) => {
    const { db, userId } = await userClient(req);
    const body = RecapRequest.safeParse(await req.json().catch(() => null));
    if (!body.success) throw new HttpError(400, "Missing week_start");
    const { week_start, tz_offset_min } = body.data;
    const start = weekStartInstant(week_start, tz_offset_min);
    if (Number.isNaN(start) || new Date(start - tz_offset_min * 60_000).getUTCDay() !== 1) throw new HttpError(400, "week_start must be a Monday");
    // Recaps unlock on the week's Sunday, so a half-finished week is never saved as final.
    if (Date.now() < start + 6 * DAY) throw new HttpError(409, "This week's recap is ready on Sunday.");

    const { data: existing } = await db.from("weekly_recaps").select("*").eq("week_start", week_start).maybeSingle();
    if (existing) return json(existing);

    const end = start + 7 * DAY;
    const from = new Date(start - 84 * DAY).toISOString();
    const [{ data: profile }, { data: sessions, error: e1 }] = await Promise.all([
      db.from("users").select("unit_system").eq("id", userId).single(),
      db
        .from("workout_sessions")
        .select("id, name, start_time, end_time, volume")
        .not("end_time", "is", null)
        .gte("start_time", from)
        .lt("start_time", new Date(end).toISOString())
        .order("start_time"),
    ]);
    if (e1) throw new HttpError(500, "Couldn't read your workouts.");
    const unit: UnitSystem = profile?.unit_system ?? "imperial";
    const recapSessions: RecapSession[] = (sessions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      start: Date.parse(s.start_time),
      end: s.end_time ? Date.parse(s.end_time) : null,
      volume_kg: Number(s.volume),
    }));

    const ids = recapSessions.map((s) => s.id);
    const sets: RecapSet[] = [];
    // A few hundred ids per request keeps the URL short.
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db
        .from("workout_sets")
        .select("session_id, set_type, weight, reps, rpe, exercises(name, primary_muscle)")
        .in("session_id", ids.slice(i, i + 200))
        .eq("is_completed", true);
      if (error) throw new HttpError(500, "Couldn't read your sets.");
      for (const r of data ?? []) {
        const ex = r.exercises as unknown as { name: string; primary_muscle: string } | null;
        sets.push({
          session_id: r.session_id,
          exercise: ex?.name ?? "Exercise",
          muscle: ex?.primary_muscle ?? "",
          set_type: r.set_type,
          weight_kg: Number(r.weight),
          reps: r.reps,
          rpe: r.rpe == null ? null : Number(r.rpe),
        });
      }
    }

    const facts = recapFacts(recapSessions, sets, start, unit);
    let text: RecapText = rulesRecap(facts);
    let source: "ai" | "rules" = "rules";
    if (facts.workouts > 0) {
      try {
        await checkDailyLimit(userId, "weekly_recap");
        const out = await askStructured({
          userId,
          kind: "weekly_recap",
          system: RECAP_SYSTEM_PROMPT,
          prompt: factsPrompt(facts),
          schema: RecapOutput,
          effort: "low",
          maxTokens: 4000,
        });
        const tidy = tidyRecap(out);
        if (tidy.headline && tidy.wins.length && tidy.next_week.length) {
          text = tidy;
          source = "ai";
        }
      } catch (e) {
        // No key, daily limit, or API trouble: the rule-based recap still helps.
        console.warn("weekly-recap: using rules only:", e instanceof Error ? e.message : e);
      }
    }

    const recap = {
      ...text,
      numbers: {
        workouts: facts.workouts,
        sets: facts.sets,
        volume_kg: facts.volume_kg,
        minutes: facts.minutes,
        records: facts.records.length,
        prev_workouts: facts.prev_workouts,
        prev_volume_kg: facts.prev_volume_kg,
      },
    };
    const { data: saved, error } = await adminClient()
      .from("weekly_recaps")
      .upsert({ user_id: userId, week_start, recap, source }, { onConflict: "user_id,week_start" })
      .select("*")
      .single();
    if (error) throw new HttpError(500, "Couldn't save your recap.");
    return json(saved);
  }),
);
