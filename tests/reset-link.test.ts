import { test } from "node:test";
import assert from "node:assert/strict";
import { parseResetLink } from "../src/lib/reset-link.ts";

test("reads the sign-in from the app link's fragment", () => {
  assert.deepEqual(parseResetLink("com.ironlog.app://reset-password#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery"), {
    access_token: "a.b.c",
    refresh_token: "r1",
  });
});

test("reads the one-time code from a PKCE link", () => {
  assert.deepEqual(parseResetLink("com.ironlog.app://reset-password?code=abc-123"), { code: "abc-123" });
});

test("an expired link gives its error", () => {
  assert.deepEqual(parseResetLink("com.ironlog.app://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"), {
    error: "Email link is invalid or has expired",
  });
});

test("anything else is ignored", () => {
  assert.equal(parseResetLink("com.ironlog.app://reset-password"), null);
});
