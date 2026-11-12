import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { clearUsdaKey, getUsdaKey, hasUsdaKey, maskKey, redactKey, setUsdaKey } from "../src/lib/nutrition/key-store.ts";
import { createUsdaClient } from "../src/lib/nutrition/sources/usda.ts";
import { explainSearchError } from "../src/lib/nutrition/search-service.ts";
import { NutritionError } from "../src/lib/nutrition/http.ts";
import { createNutritionStore } from "../src/lib/offline/nutrition-store.ts";
import { createNutritionOutbox, type DbLike } from "../src/lib/offline/nutrition-outbox.ts";
import { DEFAULT_PREFS } from "../src/lib/nutrition/day.ts";

const KEY = "TESTKEY-not-real";

function fakeLocalStorage(throws = false) {
  const m = new Map<string, string>();
  const ls = {
    getItem: (k: string) => {
      if (throws) throw new Error("blocked");
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error("blocked");
      m.set(k, v);
    },
    removeItem: (k: string) => void m.delete(k),
  };
  (globalThis as { localStorage?: unknown }).localStorage = ls;
  return m;
}

test("set, get, has and clear", () => {
  fakeLocalStorage();
  assert.equal(hasUsdaKey(), false);
  assert.equal(setUsdaKey(`  ${KEY} `), true);
  assert.equal(getUsdaKey(), KEY);
  assert.equal(hasUsdaKey(), true);
  clearUsdaKey();
  assert.equal(getUsdaKey(), "");
  assert.equal(setUsdaKey("   "), false);
});

test("a blocked localStorage never throws", () => {
  fakeLocalStorage(true);
  assert.equal(getUsdaKey(), "");
  assert.equal(setUsdaKey(KEY), false);
  clearUsdaKey();
});

test("maskKey never returns the full key", () => {
  assert.equal(maskKey(""), "not set");
  const m = maskKey(KEY);
  assert.equal(m, "saved, ends …real");
  assert.ok(!m.includes(KEY));
  assert.ok(!maskKey("abcd").includes("abc,"));
});

test("redactKey removes the key and its URL-encoded form", () => {
  const key = "TEST KEY/not+real";
  const text = `GET https://x/y?api_key=${encodeURIComponent(key)}&q=a failed for ${key}`;
  const out = redactKey(text, key);
  assert.ok(!out.includes(key));
  assert.ok(!out.includes(encodeURIComponent(key)));
  assert.ok(out.includes("[key]"));
  assert.equal(redactKey("nothing here", ""), "nothing here");
});

test("a USDA error that carries the request URL is clean after redactKey", async () => {
  const client = createUsdaClient({
    get: async (url, params) => {
      throw new Error(`request to ${url}?api_key=${encodeURIComponent(params.api_key ?? "")} failed`);
    },
  });
  let message = "";
  try {
    await client.search("oats", KEY);
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  assert.ok(message.includes("failed"));
  assert.ok(!redactKey(message, KEY).includes(KEY));
});

test("search notes are fixed wording, never raw error text", () => {
  const e = new NutritionError("unauthorized", `bad ${KEY}`);
  assert.equal(explainSearchError("usda", e), "Check your USDA key in Settings");
  assert.equal(explainSearchError("usda", new NutritionError("rate-limited")), "Too many searches, wait a minute");
  assert.ok(!explainSearchError("usda", new NutritionError("unavailable", KEY)).includes(KEY));
});

test("backup and CSV export never mention the key store", () => {
  for (const f of ["src/lib/backup.ts", "src/lib/export-csv.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/key-store|usda-key/i.test(src), f);
  }
});

test("saving prefs puts no key in kv or the outbox", async () => {
  fakeLocalStorage();
  setUsdaKey(KEY);
  const kv = new Map<string, unknown>();
  const outboxState = { value: undefined as unknown };
  const db: DbLike = {
    from: () => ({
      upsert: async () => ({ error: null }),
      update: () => ({ in: async () => ({ error: null }) }),
      delete: () => ({ in: async () => ({ error: null }) }),
    }),
  };
  const outbox = createNutritionOutbox({
    store: { get: async () => outboxState.value, set: async (v) => ((outboxState.value = v), true) },
    getDb: () => db,
    hasSession: async () => true,
    refreshSession: async () => {},
    isOnline: () => false,
  });
  const store = createNutritionStore({
    kv: { get: async <T>(k: string) => kv.get(k) as T | undefined, set: async (k, v) => (kv.set(k, v), true) },
    outbox,
    db: { read: async () => ({ data: null, error: null }) },
    userId: async () => "user-1",
  });
  await store.savePrefs({ ...DEFAULT_PREFS, day_start: "04:00" });
  const dump = JSON.stringify([...kv.entries()]) + JSON.stringify(outboxState.value);
  assert.ok(dump.includes("04:00"));
  assert.ok(!dump.includes(KEY));
  assert.ok(!dump.includes("usda"));
  clearUsdaKey();
});
