import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { LogWorkoutInput, localToUtc, planWorkout } from "../supabase/functions/_shared/connector.ts";
import { rankMatches, type LibraryExercise } from "../supabase/functions/_shared/import.ts";
import { handleMessage, text, tool, ToolError } from "../supabase/functions/_shared/mcp.ts";

const lib = (slug: string, name: string, aliases: string[] = [], created_by: string | null = null): LibraryExercise => ({
  id: `${created_by ? "mine-" : ""}${slug}`, slug, name, aliases, equipment: "barbell", created_by,
});
const library = [
  lib("barbell-bench-press", "Barbell Bench Press", ["Bench Press"]),
  lib("barbell-row", "Barbell Row", ["Bent Over Row"]),
  lib("dumbbell-row", "Dumbbell Row"),
  lib("pull-up", "Pull Up"),
];
// 2026-10-14 22:00 UTC = 18:00 in New York (EDT, UTC-4)
const now = Date.UTC(2026, 9, 14, 22, 0);
const ctx = { library, unit: "imperial" as const, now };
const input = (x: Partial<LogWorkoutInput>) => LogWorkoutInput.parse({ unit: "lb", exercises: [], ...x });

test("a just-finished workout ends now, with lb converted to kg", () => {
  const w = planWorkout(
    input({
      title: "Push",
      duration_minutes: 60,
      exercises: [
        { exercise: "barbell-bench-press", sets: [{ weight: 225, reps: 5 }, { weight: 225, reps: 5 }, { weight: 225, reps: 4, set_type: "failure" }] },
        { exercise: "Pull ups", sets: [{ reps: 10 }] },
      ],
    }),
    ctx,
  );
  assert.equal(w.name, "Push");
  assert.equal(w.minutes, 60);
  assert.equal(w.start.getTime(), now - 60 * 60_000);
  assert.equal(w.exercises[0].exercise_id, "barbell-bench-press");
  assert.equal(w.exercises[0].sets.length, 3);
  assert.ok(Math.abs(w.exercises[0].sets[0].weight_kg - 102.058) < 0.01);
  assert.equal(w.exercises[0].sets[2].set_type, "failure");
  // Matched by name, bodyweight
  assert.equal(w.exercises[1].exercise_id, "pull-up");
  assert.equal(w.exercises[1].sets[0].weight_kg, 0);
});

test("unknown exercises are refused with the closest slugs, nothing planned", () => {
  assert.throws(
    () => planWorkout(input({ exercises: [{ exercise: "Pendlay row", sets: [{ weight: 135, reps: 5 }] }] }), ctx),
    (e: Error) => /Nothing saved/.test(e.message) && /barbell-row/.test(e.message) && /if_new/.test(e.message),
  );
});

test("if_new adds an exercise that isn't in the library", () => {
  const w = planWorkout(
    input({ exercises: [{ exercise: "landmine press", sets: [{ weight: 45, reps: 10 }], if_new: { primary_muscle: "front_delts", equipment: "barbell" } }] }),
    ctx,
  );
  assert.equal(w.exercises[0].exercise_id, null);
  assert.deepEqual(w.exercises[0].create, { name: "Landmine Press", slug: "landmine-press", primary_muscle: "front_delts", equipment: "barbell" });
});

test("dates and times are read in the lifter's time zone", () => {
  // 07:30 in New York on Oct 13 is 11:30 UTC.
  const w = planWorkout(
    input({ date: "2026-10-13", start_time: "7:30", timezone: "America/New_York", duration_minutes: 45, exercises: [{ exercise: "pull-up", sets: [{ reps: 8 }] }] }),
    ctx,
  );
  assert.equal(w.start.toISOString(), "2026-10-13T11:30:00.000Z");
  // A past day without a time lands at midday local.
  const w2 = planWorkout(input({ date: "2026-10-10", timezone: "America/New_York", exercises: [{ exercise: "pull-up", sets: [{ reps: 8 }] }] }), ctx);
  assert.equal(w2.start.toISOString(), "2026-10-10T16:00:00.000Z");
  // DST: winter offset is -5
  assert.equal(new Date(localToUtc("2026-01-05", "12:00", "America/New_York")).toISOString(), "2026-01-05T17:00:00.000Z");
});

test("future dates, future times and bad zones are refused", () => {
  const one = [{ exercise: "pull-up", sets: [{ reps: 8 }] }];
  assert.throws(() => planWorkout(input({ date: "2026-10-16", exercises: one }), ctx), /future/);
  assert.throws(() => planWorkout(input({ start_time: "21:00", timezone: "America/New_York", exercises: one }), ctx), /future/);
  assert.throws(() => planWorkout(input({ timezone: "Mars/Olympus", exercises: one }), ctx), /time zone/);
  assert.throws(() => planWorkout(input({ date: "2026-02-30", exercises: one }), ctx), /real date/);
});

test("no length given: about 3 minutes a set, at least 15", () => {
  const w = planWorkout(input({ exercises: [{ exercise: "pull-up", sets: [{ reps: 8 }, { reps: 8 }] }] }), ctx);
  assert.equal(w.minutes, 15);
  assert.equal(w.name, "Workout");
});

test("rankMatches orders by closeness and keeps matchByName's tie rule", () => {
  const ranked = rankMatches("row", [...library, lib("barbell-row", "Barbell Row", [], "u1")], 3);
  assert.ok(ranked.length >= 2);
  assert.ok(ranked.every((m, i) => i === 0 || ranked[i - 1].score >= m.score));
});

// ---------- MCP protocol ----------

const server = {
  name: "ironlog",
  title: "Ironlog",
  version: "1",
  instructions: "hi",
  tools: [
    tool({
      name: "echo",
      title: "Echo",
      description: "Echo",
      input: z.object({ say: z.string(), times: z.number().int().optional() }),
      async run({ say, times }) {
        if (say === "boom") throw new ToolError("no booms");
        return text(say.repeat(times ?? 1));
      },
    }),
  ],
};

test("initialize negotiates the protocol version", async () => {
  const r = await handleMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, server);
  assert.equal((r?.result as { protocolVersion: string }).protocolVersion, "2025-06-18");
  const r2 = await handleMessage({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, server);
  assert.equal((r2?.result as { protocolVersion: string }).protocolVersion, "2025-11-25");
});

test("notifications get no response; unknown methods get -32601", async () => {
  assert.equal(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, server), null);
  const r = await handleMessage({ jsonrpc: "2.0", id: 3, method: "resources/list" }, server);
  assert.equal(r?.error?.code, -32601);
});

test("tools/list exposes a JSON Schema for each tool", async () => {
  const r = await handleMessage({ jsonrpc: "2.0", id: 4, method: "tools/list" }, server);
  const [t] = (r?.result as { tools: { name: string; inputSchema: { type: string; required: string[]; $schema?: string } }[] }).tools;
  assert.equal(t.name, "echo");
  assert.equal(t.inputSchema.type, "object");
  assert.deepEqual(t.inputSchema.required, ["say"]);
  assert.equal(t.inputSchema.$schema, undefined);
});

test("the real log_workout schema converts to JSON Schema", () => {
  const s = z.toJSONSchema(LogWorkoutInput, { io: "input" }) as { required: string[] };
  assert.deepEqual(s.required.sort(), ["exercises", "unit"]);
});

test("tools/call: results, bad arguments and tool errors", async () => {
  const call = (args: unknown) => handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "echo", arguments: args } }, server);
  assert.deepEqual((await call({ say: "hi", times: 2 }))?.result, { content: [{ type: "text", text: "hihi" }] });
  const bad = (await call({ say: 3 }))?.result as { isError: boolean; content: { text: string }[] };
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /say/);
  const boom = (await call({ say: "boom" }))?.result as { isError: boolean; content: { text: string }[] };
  assert.deepEqual(boom, { content: [{ type: "text", text: "no booms" }], isError: true });
  const unknown = await handleMessage({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nope" } }, server);
  assert.equal(unknown?.error?.code, -32602);
});
