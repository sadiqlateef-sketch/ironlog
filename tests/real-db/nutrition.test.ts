// Nutrition diary row security, against a real Supabase database (not the mock).
// Needs the 20261112000000 migration applied to a LOCAL database:
//   npx supabase start
//   npm run test:db
// It skips itself when no database is set.

import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_KEY;
const skip = !url || !key ? "set SUPABASE_TEST_URL and SUPABASE_TEST_KEY (see npx supabase status)" : false;

const { createClient } = await import("@supabase/supabase-js");

async function newUser() {
  const db = createClient(url ?? "http://localhost", key ?? "x", { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `nutrition-${crypto.randomUUID()}@test.local`;
  const { data, error } = await db.auth.signUp({ email, password: "test-password-123" });
  assert.ifError(error);
  assert.ok(data.session, "local Supabase should sign new users straight in");
  return { db, userId: data.session.user.id };
}

const nutrients = { energy: { value: 100, state: "complete" } };

test("a food and its entries belong to one person", { skip }, async () => {
  const a = await newUser();
  const b = await newUser();

  const foodId = crypto.randomUUID();
  const ins = await a.db.from("foods").insert({ id: foodId, name: "RLS test food", nutrients, source: "user" });
  assert.ifError(ins.error);

  // B cannot see A's food.
  const seen = await b.db.from("foods").select("id").eq("id", foodId);
  assert.equal(seen.data?.length ?? 0, 0);

  // B cannot write a food as A.
  const forged = await b.db.from("foods").insert({ user_id: a.userId, name: "forged", nutrients, source: "user" });
  assert.ok(forged.error, "inserting a food for someone else should be refused");

  // B cannot point an entry at A's food.
  const entry = {
    food_day: "2026-11-12", meal_id: "m", meal_name: "M", name: "x", quantity: 1, unit: "g", nutrients, food_id: foodId,
  };
  const pointed = await b.db.from("food_entries").insert(entry);
  assert.ok(pointed.error, "pointing an entry at someone else's food should be refused");

  // A can, and the entry survives the food being deleted.
  const own = await a.db.from("food_entries").insert({ ...entry, id: crypto.randomUUID() }).select("id").single();
  assert.ifError(own.error);
  const del = await a.db.from("foods").delete().eq("id", foodId);
  assert.ifError(del.error);
  const after = await a.db.from("food_entries").select("food_id").eq("id", own.data!.id).single();
  assert.equal(after.data?.food_id, null);

  // B cannot see A's entry.
  const seenEntry = await b.db.from("food_entries").select("id").eq("id", own.data!.id);
  assert.equal(seenEntry.data?.length ?? 0, 0);
});
