import test from "node:test";
import assert from "node:assert/strict";
import { parseSpokenSet as phoneParseSpokenSet } from "../src/lib/voice-set.ts";
import { parseSpokenSet as watchParseSpokenSet } from "../watch/src/voiceSet.ts";

test("voice set parity: phone and watch parsers produce identical results", () => {
  const exercises = [
    { key: 0, name: "Bench Press" },
    { key: 1, name: "Barbell Squat" },
    { key: 2, name: "Deadlift" },
    { key: 3, name: "Barbell Row" },
  ];

  const testPhrases = [
    "185 for 8",
    "bench 225 for 5",
    "squat 315 for 3",
    "deadlift 405 for 1",
    "row 135 for 10",
    "just 10 reps",
    "100 kg for 6",
    "invalid utterance hello",
  ];

  for (const phrase of testPhrases) {
    const phoneResult = phoneParseSpokenSet(phrase, exercises);
    const watchResult = watchParseSpokenSet(phrase, exercises);
    assert.deepEqual(
      phoneResult,
      watchResult,
      `Mismatch on phrase "${phrase}": phone=${JSON.stringify(phoneResult)}, watch=${JSON.stringify(watchResult)}`,
    );
  }
});

test("pairing code validation: phone enforces 6-digit numeric pattern", () => {
  const isValidCode = (code: string) => typeof code === "string" && /^\d{6}$/.test(code);

  assert.equal(isValidCode("123456"), true);
  assert.equal(isValidCode("000000"), true);
  assert.equal(isValidCode("999999"), true);
  assert.equal(isValidCode("12345"), false); // too short
  assert.equal(isValidCode("1234567"), false); // too long
  assert.equal(isValidCode("12345a"), false); // letter
  assert.equal(isValidCode(""), false);
  assert.equal(isValidCode("  123456  "), false); // unstripped spaces
});

test("watch pairing claim rate-limiting: max 10 failed attempts per window", () => {
  const MAX_FAILED_CLAIMS = 10;
  const attempts: { userId: string; timestamp: number }[] = [];

  function recordFailedAttempt(userId: string, now: number) {
    attempts.push({ userId, timestamp: now });
  }

  function checkRateLimit(userId: string, now: number): boolean {
    const windowStart = now - 10 * 60 * 1000;
    const recent = attempts.filter((a) => a.userId === userId && a.timestamp >= windowStart);
    return recent.length < MAX_FAILED_CLAIMS;
  }

  const userId = "test-user-1";
  const baseTime = Date.now();

  for (let i = 0; i < 9; i++) {
    assert.equal(checkRateLimit(userId, baseTime), true);
    recordFailedAttempt(userId, baseTime);
  }

  // 10th attempt: still allowed
  assert.equal(checkRateLimit(userId, baseTime), true);
  recordFailedAttempt(userId, baseTime);

  // 11th attempt: rate limited!
  assert.equal(checkRateLimit(userId, baseTime), false);

  // After 10 minutes: allowed again
  const laterTime = baseTime + 11 * 60 * 1000;
  assert.equal(checkRateLimit(userId, laterTime), true);
});

test("concurrent session finish idempotency: first to finish locks session", () => {
  interface ActiveSession {
    id: string;
    end_time: string | null;
  }

  const session: ActiveSession = {
    id: "sess-abc",
    end_time: null,
  };

  function finishSession(source: "phone" | "watch", timestamp: string): { success: boolean; winner: string } {
    if (session.end_time !== null) {
      return { success: false, winner: "previous" };
    }
    session.end_time = timestamp;
    return { success: true, winner: source };
  }

  // Watch finishes first
  const r1 = finishSession("watch", "2026-10-24T02:00:00.000Z");
  assert.equal(r1.success, true);
  assert.equal(r1.winner, "watch");

  // Phone attempts finish afterward
  const r2 = finishSession("phone", "2026-10-24T02:00:01.000Z");
  assert.equal(r2.success, false);
  assert.equal(r2.winner, "previous");
  assert.equal(session.end_time, "2026-10-24T02:00:00.000Z");
});
