import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const NAME = "20261112000000_nutrition_diary.sql";
const sql = readFileSync(new URL(NAME, dir), "utf8");
// Comments out and whitespace collapsed, so the assertions read the real statements.
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

function policy(table: string): string {
  const m = new RegExp(`create policy "[^"]+" on public\\.${table} (.*?);`).exec(code);
  assert.ok(m, `policy on ${table}`);
  return m[1];
}

test("sorts after the workout migrations it builds on", () => {
  const names = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  assert.ok(names.includes(NAME));
  const sorted = [...names].sort();
  // Later nutrition migrations (kitchen, logs) sort after this one.
  assert.ok(sorted.indexOf(NAME) > sorted.indexOf("20261109010000_exercise_variation_group.sql"));
});

test("row level security is on for both tables", () => {
  assert.match(code, /alter table public\.foods enable row level security/);
  assert.match(code, /alter table public\.food_entries enable row level security/);
});

test("each table has an own-rows policy for signed-in users", () => {
  for (const t of ["foods", "food_entries"]) {
    const p = policy(t);
    assert.match(p, /^for all to authenticated /);
    assert.match(p, /using \(user_id = \(select auth\.uid\(\)\)\)/);
    assert.match(p, /with check \(.*user_id = \(select auth\.uid\(\)\)/);
  }
});

test("an entry can only point at a food you own", () => {
  assert.match(policy("food_entries"), /with check \(.*food_id is null or public\.can_use_food\(food_id\)/);
  assert.match(code, /create or replace function public\.can_use_food\(p_food_id uuid\)/);
  assert.match(code, /security invoker set search_path = ''/);
  assert.doesNotMatch(code, /security definer/);
  assert.match(code, /revoke execute on function public\.can_use_food\(uuid\) from public, anon/);
  assert.match(code, /grant execute on function public\.can_use_food\(uuid\) to authenticated, service_role/);
});

test("nothing is granted to anon or public", () => {
  assert.doesNotMatch(code, /grant [^;]* to [^;]*\b(anon|public)\b/);
  assert.doesNotMatch(code, /create policy [^;]* to (anon|public)\b/);
  assert.match(code, /grant select, insert, update, delete on public\.foods, public\.food_entries to authenticated/);
});

test("user_id defaults to the caller and cascades", () => {
  const re = /user_id uuid not null default auth\.uid\(\) references public\.users\(id\) on delete cascade/g;
  assert.equal((code.match(re) ?? []).length, 2);
});

test("an entry keeps living when its food is deleted", () => {
  assert.match(code, /food_id uuid references public\.foods\(id\) on delete set null/);
});

test("users columns are added idempotently", () => {
  assert.match(code, /add column if not exists nutrition_prefs jsonb/);
  assert.match(code, /add column if not exists nutrition_goals jsonb/);
  assert.match(code, /jsonb_typeof\(nutrition_prefs\) = 'object' and pg_column_size\(nutrition_prefs\) < 32768/);
});

test("foods and entries carry the documented shape", () => {
  assert.match(code, /create unique index if not exists \w+ on public\.foods \(user_id, source, source_id\) where source_id is not null/);
  assert.match(code, /source in \('user', 'off', 'usda', 'staple'\)/);
  assert.match(code, /unit in \('g', 'ml', 'oz', 'fl_oz', 'serving', 'package', 'quick'\)/);
  assert.match(code, /quantity numeric\(9,3\) not null check \(quantity > 0 and quantity <= 100000\)/);
  assert.match(code, /create index if not exists \w+ on public\.food_entries \(user_id, food_day\)/);
  assert.match(code, /execute function public\.set_updated_at\(\)/);
});
