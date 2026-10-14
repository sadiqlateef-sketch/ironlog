// The Ironlog connector for Claude: an MCP server that lets Claude (claude.ai,
// the Claude apps, Claude Code) save workouts you tell it about.
//
//   POST /functions/v1/claude-connector/<secret>     what claude.ai uses
//   POST /functions/v1/claude-connector              with "Authorization: Bearer <secret>"
//
// The secret comes from the app (Settings > Connect to Claude) and identifies
// you; only its SHA-256 hash is stored (migration 20261014073000). There's no
// Supabase sign-in here, so this function uses the service role and every
// query below is limited to that one person's rows by hand.

import { adminClient, corsHeaders } from "../_shared/http.ts";
import {
  DeleteWorkoutInput,
  describeWorkout,
  FindExercisesInput,
  LogError,
  LogWorkoutInput,
  planWorkout,
  RecentWorkoutsInput,
  type PlannedSet,
} from "../_shared/connector.ts";
import { rankMatches, type LibraryExercise } from "../_shared/import.ts";
import { handleMessage, text, tool, ToolError, type Tool } from "../_shared/mcp.ts";
import type { UnitSystem } from "../_shared/units.ts";

const INSTRUCTIONS = `Ironlog is the user's strength-training log. Use log_workout when they tell you about a workout they finished, e.g. "bench 3x5 at 225, then rows 3x10 at 135".
- Each set is its own entry: "3x5 @ 225" is three sets of 5 reps at 225.
- Use their weight unit (lb or kg) exactly as they said it; don't convert.
- Prefer exercise slugs from find_exercises. If log_workout says an exercise isn't in their library, pick the closest slug when it's clearly the same movement, otherwise ask them before adding it with if_new.
- Leave out date and start_time when they just finished. Pass timezone when you know it.
- After saving, tell them briefly what was logged. If something was wrong, recent_workouts shows what's saved and delete_workout removes a workout you logged.`;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The secret from the URL's last path segment, or the Authorization header. */
function secretFrom(req: Request): string | null {
  const last = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (last.startsWith("il_")) return last;
  const bearer = req.headers.get("Authorization")?.match(/^Bearer\s+(il_\S+)$/i);
  return bearer?.[1] ?? null;
}

async function whoIs(secret: string): Promise<string | null> {
  if (!/^il_[0-9a-f]{64}$/.test(secret)) return null;
  const admin = adminClient();
  const { data } = await admin.from("claude_links").select("user_id").eq("token_hash", await sha256(secret)).maybeSingle();
  if (!data) return null;
  await admin.from("claude_links").update({ last_used_at: new Date().toISOString() }).eq("user_id", data.user_id);
  return data.user_id;
}

function toolsFor(userId: string): Tool[] {
  const db = adminClient();

  async function profile(): Promise<{ unit: UnitSystem }> {
    const { data } = await db.from("users").select("unit_system").eq("id", userId).single();
    return { unit: data?.unit_system ?? "imperial" };
  }

  async function library(): Promise<LibraryExercise[]> {
    const { data, error } = await db
      .from("exercises")
      .select("id, slug, name, aliases, equipment, created_by")
      .or(`created_by.is.null,created_by.eq.${userId}`)
      .order("name");
    if (error) throw error;
    return data as LibraryExercise[];
  }

  return [
    tool({
      name: "find_exercises",
      title: "Find exercises",
      description:
        "Look up exercises in the user's Ironlog library (built-in plus their own) and get the slug to use in log_workout. With no query, lists the whole library.",
      input: FindExercisesInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
      async run({ query }) {
        const lib = await library();
        const rows = query?.trim()
          ? rankMatches(query, lib, 10).filter((m) => m.score >= 0.3).map((m) => m.exercise)
          : lib;
        if (!rows.length) return text(`No exercise in the library matches "${query}". Try other words, or log it with if_new.`);
        return text(rows.map((e) => `${e.slug} = ${e.name} (${e.equipment}${e.created_by ? ", the user's own" : ""})`).join("\n"));
      },
    }),

    tool({
      name: "log_workout",
      title: "Log a workout",
      description:
        "Save a finished strength workout to the user's Ironlog log: exercises with each set's weight and reps. Shows up in their history, records, charts and recovery map.",
      input: LogWorkoutInput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      async run(input) {
        const [{ unit }, lib] = await Promise.all([profile(), library()]);
        let plan;
        try {
          plan = planWorkout(input, { library: lib, unit, now: Date.now() });
        } catch (e) {
          if (e instanceof LogError) throw new ToolError(e.message);
          throw e;
        }

        // Add any new exercises first (once each, even if listed twice).
        const created = new Map<string, string>();
        for (const x of plan.exercises) {
          if (x.exercise_id || !x.create || created.has(x.create.slug)) continue;
          const { data, error } = await db
            .from("exercises")
            .insert({
              name: x.create.name,
              slug: x.create.slug,
              primary_muscle: x.create.primary_muscle,
              equipment: x.create.equipment,
              mechanic: "compound",
              created_by: userId,
            })
            .select("id")
            .single();
          if (error?.code === "23505") {
            // They already have their own exercise with that name.
            const { data: mine } = await db.from("exercises").select("id").eq("created_by", userId).eq("slug", x.create.slug).single();
            if (mine) {
              created.set(x.create.slug, mine.id);
              continue;
            }
          }
          if (error) throw error;
          created.set(x.create.slug, data.id);
        }

        const startMs = plan.start.getTime();
        const endMs = startMs + plan.minutes * 60_000;
        const { data: session, error: sErr } = await db
          .from("workout_sessions")
          .insert({
            user_id: userId,
            name: plan.name,
            start_time: new Date(startMs).toISOString(),
            end_time: new Date(endMs).toISOString(),
            notes: plan.notes || null,
            source: "claude",
          })
          .select("id")
          .single();
        if (sErr) throw sErr;

        // Same shape the app's saveFinishedWorkout writes: every set done,
        // with times spread across the workout.
        const total = plan.exercises.reduce((n, x) => n + x.sets.length, 0);
        let k = 0;
        const rows = plan.exercises.flatMap((x, i) =>
          x.sets.map((s, j) => ({
            session_id: session.id,
            user_id: userId,
            exercise_id: x.exercise_id ?? created.get(x.create!.slug)!,
            exercise_order: i + 1,
            set_number: j + 1,
            set_type: s.set_type,
            weight: s.weight_kg,
            reps: s.reps,
            rpe: s.rpe,
            is_completed: true,
            completed_at: new Date(startMs + (++k / (total + 1)) * (endMs - startMs)).toISOString(),
          })),
        );
        const { error: setErr } = await db.from("workout_sets").insert(rows);
        if (setErr) {
          await db.from("workout_sessions").delete().eq("id", session.id).eq("user_id", userId);
          throw setErr;
        }

        const tz = input.timezone ?? "UTC";
        const newNames = [...new Set(plan.exercises.filter((x) => x.create).map((x) => x.display_name))];
        const added = newNames.length ? `\nAdded to their library: ${newNames.join(", ")}.` : "";
        return text(`Saved to Ironlog:\n${describeWorkout({ id: session.id, ...plan }, unit, tz)}${added}`);
      },
    }),

    tool({
      name: "recent_workouts",
      title: "Recent workouts",
      description: "The user's most recent finished workouts in Ironlog with every set, newest first. Use it to check what's saved or answer questions about past sessions.",
      input: RecentWorkoutsInput,
      annotations: { readOnlyHint: true, openWorldHint: false },
      async run({ limit }) {
        const { unit } = await profile();
        const { data: sessions, error } = await db
          .from("workout_sessions")
          .select("id, name, start_time, end_time, source")
          .eq("user_id", userId)
          .not("end_time", "is", null)
          .order("start_time", { ascending: false })
          .limit(limit ?? 5);
        if (error) throw error;
        if (!sessions?.length) return text("No finished workouts in Ironlog yet.");

        const [{ data: sets, error: setErr }, lib] = await Promise.all([
          db
            .from("workout_sets")
            .select("session_id, exercise_id, exercise_order, set_number, weight, reps, set_type, rpe")
            .eq("user_id", userId)
            .eq("is_completed", true)
            .in("session_id", sessions.map((s) => s.id))
            .order("exercise_order")
            .order("set_number"),
          library(),
        ]);
        if (setErr) throw setErr;
        const nameOf = new Map(lib.map((e) => [e.id, e.name]));

        const out = sessions.map((s) => {
          const mine = (sets ?? []).filter((r) => r.session_id === s.id);
          const groups = new Map<number, { display_name: string; sets: PlannedSet[] }>();
          for (const r of mine) {
            const g = groups.get(r.exercise_order) ?? { display_name: nameOf.get(r.exercise_id) ?? "Exercise", sets: [] };
            g.sets.push({ weight_kg: Number(r.weight), reps: r.reps, set_type: r.set_type, rpe: r.rpe == null ? null : Number(r.rpe) });
            groups.set(r.exercise_order, g);
          }
          const start = new Date(s.start_time);
          const minutes = s.end_time ? Math.round((+new Date(s.end_time) - +start) / 60_000) : null;
          return describeWorkout({ id: s.id, name: s.name ?? "Workout", start, minutes, source: s.source, exercises: [...groups.values()] }, unit);
        });
        return text(out.join("\n\n"));
      },
    }),

    tool({
      name: "delete_workout",
      title: "Delete a workout logged from Claude",
      description:
        "Remove a workout that was saved through this connector (for fixing a mistake: delete it, then log it again). Workouts logged in the app itself can't be deleted from here.",
      input: DeleteWorkoutInput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
      async run({ workout_id }) {
        const { data: s } = await db
          .from("workout_sessions")
          .select("id, name, source")
          .eq("id", workout_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (!s) throw new ToolError("No workout with that id in this user's Ironlog.");
        if (s.source !== "claude") throw new ToolError("That workout was logged in the app, so it can only be changed there.");
        const { error } = await db.from("workout_sessions").delete().eq("id", s.id).eq("user_id", userId);
        if (error) throw error;
        return text(`Deleted "${s.name ?? "Workout"}".`);
      },
    }),
  ];
}

const JSON_HEADERS = { ...corsHeaders, "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // No server-to-client stream and no sessions: per the spec, GET and DELETE get 405.
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: "POST" } });

  const secret = secretFrom(req);
  const userId = secret ? await whoIs(secret) : null;
  if (!userId) {
    return reply(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "This Ironlog connector link isn't valid any more. Make a new one in the app: Progress > gear > Connect to Claude." } },
      401,
    );
  }

  const body = await req.json().catch(() => undefined);
  if (body === undefined) return reply({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);

  const server = { name: "ironlog", title: "Ironlog", version: "1.0.0", instructions: INSTRUCTIONS, tools: toolsFor(userId) };
  if (Array.isArray(body)) {
    // Batches (allowed by older protocol versions).
    const out = (await Promise.all(body.map((m) => handleMessage(m, server)))).filter((r) => r !== null);
    return out.length ? reply(out) : new Response(null, { status: 202, headers: corsHeaders });
  }
  const res = await handleMessage(body, server);
  return res ? reply(res) : new Response(null, { status: 202, headers: corsHeaders });
});
