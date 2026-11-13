-- Nutrition logs (N5): water and supplement check-offs
--
--  * nutrition_logs: one row per glass of water (amount in ml) or per
--    supplement dose taken (amount = doses, ref = the supplement's id in
--    users.nutrition_goals). Kept apart from food_entries so a glass of water
--    or a capsule never shows up as food or changes the day's nutrients.
--  * food_day is the food day the log belongs to (same rule as food_entries),
--    so a 03:00 glass on a night shift lands on the right day.
--
-- Goals themselves live in users.nutrition_goals (20261112000000), so no new
-- column is needed for them.
--
-- Row security follows 20261112000000_nutrition_diary.sql: signed-in only,
-- your rows only. Nothing here runs as security definer.

create table if not exists public.nutrition_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users(id) on delete cascade,
  kind       text not null check (kind in ('water', 'supplement')),
  food_day   date not null,
  amount     numeric(9,2) not null check (amount > 0),
  ref        text check (ref is null or length(ref) <= 40),
  logged_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_logs_user_day_idx
  on public.nutrition_logs (user_id, food_day);

create index if not exists nutrition_logs_user_updated_idx
  on public.nutrition_logs (user_id, updated_at desc);

drop trigger if exists nutrition_logs_updated_at on public.nutrition_logs;
create trigger nutrition_logs_updated_at
  before update on public.nutrition_logs
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row security
-- -----------------------------------------------------------------------------
alter table public.nutrition_logs enable row level security;

drop policy if exists "nutrition_logs: own rows" on public.nutrition_logs;
create policy "nutrition_logs: own rows" on public.nutrition_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.nutrition_logs to authenticated;
