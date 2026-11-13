import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../supabase/migrations/", import.meta.url);
const NAME = "20261114010000_nutrition_logs.sql";
const sql = readFileSync(new URL(NAME, dir), "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .replace(/\s+/g, " ")
  .toLowerCase();

test("logs migration sorts after the kitchen migration", () => {
  const sorted = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  assert.ok(sorted.indexOf(NAME) > sorted.indexOf("20261114000000_nutrition_kitchen.sql"));
});

test("nutrition_logs has row level security and an own-rows policy", () => {
  assert.match(code, /alter table public\.nutrition_logs enable row level security/);
  const m = /create policy "[^"]+" on public\.nutrition_logs (.*?);/.exec(code);
  assert.ok(m);
  assert.match(m[1], /^for all to authenticated /);
  assert.match(m[1], /using \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(m[1], /with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.doesNotMatch(code, /security definer/);
  assert.doesNotMatch(code, /grant [^;]* to [^;]*\b(anon|public)\b/);
  assert.match(code, /grant select, insert, update, delete on public\.nutrition_logs to authenticated/);
});

test("nutrition_logs carries the documented shape", () => {
  assert.match(code, /kind text not null check \(kind in \('water', 'supplement'\)\)/);
  assert.match(code, /amount numeric\(9,2\) not null check \(amount > 0\)/);
  assert.match(code, /ref text check \(ref is null or length\(ref\) <= 40\)/);
  assert.match(code, /food_day date not null/);
  assert.match(code, /on public\.nutrition_logs \(user_id, food_day\)/);
  assert.match(code, /user_id uuid not null default auth\.uid\(\) references public\.users\(id\) on delete cascade/);
  assert.match(code, /create trigger nutrition_logs_updated_at before update on public\.nutrition_logs for each row execute function public\.set_updated_at\(\)/);
});
