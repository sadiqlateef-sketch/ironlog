import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const NAME = "20261114000000_nutrition_kitchen.sql";
const sql = readFileSync(new URL(NAME, dir), "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

const TABLES = ["recipes", "batches", "usuals", "pantry_items"];

function policy(table: string): string {
  const m = new RegExp(`create policy "[^"]+" on public\\.${table} (.*?);`).exec(code);
  assert.ok(m, `policy on ${table}`);
  return m[1];
}

test("kitchen migration sorts after the diary migration", () => {
  const sorted = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(sorted.indexOf(NAME) > sorted.indexOf("20261112000000_nutrition_diary.sql"));
});

test("row level security is on for all four kitchen tables", () => {
  for (const t of TABLES) assert.match(code, new RegExp(`alter table public\\.${t} enable row level security`));
});

test("each kitchen table has an own-rows policy for signed-in users", () => {
  for (const t of TABLES) {
    const p = policy(t);
    assert.match(p, /^for all to authenticated /);
    assert.match(p, /using \(user_id = \(select auth\.uid\(\)\)\)/);
    assert.match(p, /with check \(.*user_id = \(select auth\.uid\(\)\)/);
  }
});

test("rows can only point at a food you own", () => {
  assert.match(policy("recipes"), /food_id is null or public\.can_use_food\(food_id\)/);
  assert.match(policy("batches"), /public\.can_use_food\(food_id\)/);
  assert.match(policy("pantry_items"), /public\.can_use_food\(food_id\)/);
  assert.doesNotMatch(code, /security definer/);
});

test("nothing is granted to anon or public", () => {
  assert.doesNotMatch(code, /grant [^;]* to [^;]*\b(anon|public)\b/);
  assert.match(code, /grant select, insert, update, delete on public\.recipes, public\.batches, public\.usuals, public\.pantry_items to authenticated/);
});

test("entries get a status that is logged or planned, logged by default", () => {
  assert.match(code, /add column if not exists status text not null default 'logged' check \(status in \('logged', 'planned'\)\)/);
});

test("the food source check is replaced by name and keeps the old four sources", () => {
  assert.match(code, /drop constraint if exists foods_source_check/);
  assert.match(code, /add constraint foods_source_check check \(source in \('user', 'off', 'usda', 'staple', 'recipe'\)\)/);
});

test("food prices are optional and never negative", () => {
  assert.match(code, /add column if not exists price_cents integer check \(price_cents is null or price_cents >= 0\)/);
  assert.match(code, /add column if not exists price_amount numeric\(9,2\) check \(price_amount is null or price_amount > 0\)/);
});

test("tables carry the documented shape, size checks and update triggers", () => {
  assert.match(code, /servings numeric\(6,2\) not null check \(servings > 0\)/);
  assert.match(code, /jsonb_typeof\(items\) = 'array' and pg_column_size\(items\) < 32768/);
  assert.match(code, /portions_left numeric\(6,2\) not null check \(portions_left >= 0\)/);
  assert.match(code, /unit in \('g', 'ml', 'serving', 'package'\)/);
  assert.match(code, /location in \('fridge', 'freezer', 'cupboard'\)/);
  assert.match(code, /recipe_id uuid references public\.recipes\(id\) on delete set null/);
  for (const t of TABLES) {
    assert.match(code, new RegExp(`on public\\.${t} \\(user_id, updated_at desc\\)`));
    assert.match(code, new RegExp(`create trigger ${t}_updated_at before update on public\\.${t} for each row execute function public\\.set_updated_at\\(\\)`));
  }
  const re = /user_id uuid not null default auth\.uid\(\) references public\.users\(id\) on delete cascade/g;
  assert.equal((code.match(re) ?? []).length, 4);
});
