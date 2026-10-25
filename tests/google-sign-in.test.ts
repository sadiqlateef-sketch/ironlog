import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAuthCallback } from "../src/lib/google-sign-in-logic.ts";

test("the code from Google comes out of the callback link", () => {
  assert.deepEqual(parseAuthCallback("com.ironlog.app://auth-callback?code=abc-123"), { code: "abc-123" });
  assert.deepEqual(parseAuthCallback("com.ironlog.app://auth-callback/?code=xyz"), { code: "xyz" });
});

test("other links aren't sign-in callbacks", () => {
  assert.equal(parseAuthCallback("com.ironlog.app://gym-calendar?ok=1"), null);
  assert.equal(parseAuthCallback("https://example.com/?code=abc"), null);
});

test("errors read like sentences", () => {
  assert.deepEqual(parseAuthCallback("com.ironlog.app://auth-callback?error=access_denied"), { error: "Google sign-in was cancelled." });
  assert.deepEqual(
    parseAuthCallback("com.ironlog.app://auth-callback#error=server_error&error_description=Database+error+saving+new+user"),
    { error: "Database error saving new user" },
  );
  assert.deepEqual(parseAuthCallback("com.ironlog.app://auth-callback"), { error: "Google sign-in didn't finish. Try again." });
});
