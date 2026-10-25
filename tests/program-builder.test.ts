import test from "node:test";
import assert from "node:assert/strict";
import { PlanRequest } from "../supabase/functions/_shared/program.ts";
import { handleMockRequest } from "../src/lib/supabase/mock-backend.ts";

test("PlanRequest validates AI provider correctly", () => {
  const base = {
    goal: "hypertrophy" as const,
    methodology: "rp" as const,
    days_per_week: 4,
    weeks: 8,
    session_minutes: 60,
    experience: "intermediate" as const,
    equipment: ["barbell", "dumbbell"],
  };

  // Default provider is gemini
  const defaultParsed = PlanRequest.parse(base);
  assert.equal(defaultParsed.provider, "gemini");

  // Explicit gemini
  const geminiParsed = PlanRequest.parse({ ...base, provider: "gemini" });
  assert.equal(geminiParsed.provider, "gemini");

  // Explicit claude
  const claudeParsed = PlanRequest.parse({ ...base, provider: "claude" });
  assert.equal(claudeParsed.provider, "claude");

  // Invalid provider rejected
  assert.equal(PlanRequest.safeParse({ ...base, provider: "gpt4" }).success, false);
});

test("mock-backend generates Gemini and Claude plans and manages active program lifecycle", async () => {
  // In-memory mock storage
  const mockStorage: Record<string, string> = {};
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => mockStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        mockStorage[k] = v;
      },
      removeItem: (k: string) => {
        delete mockStorage[k];
      },
    },
  };

  // 1. Generate a Gemini program
  const geminiRes = await handleMockRequest("https://mock-supabase.local/functions/v1/generate-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "gemini",
      goal: "hypertrophy",
      weeks: 6,
      days_per_week: 4,
      methodology: "rp",
    }),
  });
  assert.ok(geminiRes);
  assert.equal(geminiRes.status, 200);
  const geminiData = await geminiRes.json();
  assert.ok(geminiData.program_id);
  assert.match(geminiData.program_name, /Gemini Hypertrophy/);
  assert.equal(geminiData.workouts, 24); // 6 weeks * 4 days

  // 2. Generate a Claude program
  const claudeRes = await handleMockRequest("https://mock-supabase.local/functions/v1/generate-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "claude",
      goal: "strength",
      weeks: 4,
      days_per_week: 3,
      methodology: "531",
    }),
  });
  assert.ok(claudeRes);
  assert.equal(claudeRes.status, 200);
  const claudeData = await claudeRes.json();
  assert.ok(claudeData.program_id);
  assert.match(claudeData.program_name, /Claude Strength/);
  assert.equal(claudeData.workouts, 12); // 4 weeks * 3 days

  // 3. Verify programs list initially has neither active
  const listRes = await handleMockRequest("https://mock-supabase.local/rest/v1/programs?select=*");
  assert.ok(listRes);
  assert.equal(listRes.status, 200);
  const listData = await listRes.json();
  assert.equal(listData.length, 2);
  assert.ok(listData.every((p: { is_active: boolean }) => !p.is_active));

  // 4. Start Gemini program -> becomes the ONLY active program
  const startRes = await handleMockRequest("https://mock-supabase.local/rest/v1/rpc/start_program", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: geminiData.program_id }),
  });
  assert.ok(startRes);
  assert.equal(startRes.status, 200);

  const afterStartRes = await handleMockRequest("https://mock-supabase.local/rest/v1/programs?select=*");
  assert.ok(afterStartRes);
  const afterStartData = await afterStartRes.json();
  const activeProg = afterStartData.find((p: { is_active: boolean }) => p.is_active);
  assert.ok(activeProg);
  assert.equal(activeProg.id, geminiData.program_id);

  // 5. Check program_progress reporting
  const progressRes = await handleMockRequest("https://mock-supabase.local/rest/v1/rpc/program_progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_program_id: geminiData.program_id }),
  });
  assert.ok(progressRes);
  assert.equal(progressRes.status, 200);
  const progressData = await progressRes.json();
  assert.equal(progressData.length, 1);
  assert.equal(progressData[0].total, 24);
  assert.equal(progressData[0].done, 0);
  assert.equal(progressData[0].is_active, true);
  assert.equal(progressData[0].next_week, 1);
  assert.equal(progressData[0].next_day, 1);

  // 6. Stop program
  const stopRes = await handleMockRequest("https://mock-supabase.local/rest/v1/rpc/stop_program", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: geminiData.program_id }),
  });
  assert.ok(stopRes);
  assert.equal(stopRes.status, 200);

  const afterStopRes = await handleMockRequest("https://mock-supabase.local/rest/v1/programs?select=*");
  assert.ok(afterStopRes);
  const afterStopData = await afterStopRes.json();
  assert.ok(afterStopData.every((p: { is_active: boolean }) => !p.is_active));
});
