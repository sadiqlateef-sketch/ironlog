-- Nutrition food diary (N2)
--
--  * users.nutrition_prefs: meal slots with time windows, the "my day starts
--    at" time and the staples version. Kept on the profile so it works offline
--    like the rest of your settings.
--  * users.nutrition_goals: reserved for daily targets (no screen uses it yet).
--  * foods: your own food library. Values are per 100 g, or per 100 ml when
--    the food is a liquid.
--  * food_entries: one row per logged item. Each entry carries its own snapshot
--    of the food and its own nutrient totals, so editing or deleting a food
--    never rewrites what you already ate.
--
-- Row security follows 20261016000000_lockdown.sql: signed-in only, your rows
-- only, and an entry can only point at a food you own. Nothing here runs as
-- security definer.

alter table public.users
  add column if not exists nutrition_prefs jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrition_prefs) = 'object' and pg_column_size(nutrition_prefs) < 32768),
  add column if not exists nutrition_goals jsonb not null default '{}'::jsonb
    check (jsonb_typeof(nutrition_goals) = 'object' and pg_column_size(nutrition_goals) < 32768);

-- -----------------------------------------------------------------------------
-- foods
-- -----------------------------------------------------------------------------
create table if not exists public.foods (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.users(id) on delete cascade,
  name           text not null check (length(name) between 1 and 200),
  brand          text check (brand is null or length(brand) <= 200),
  barcode        text check (barcode is null or length(barcode) <= 64),
  liquid         boolean not null default false,
  serving_amount numeric(9,2) check (serving_amount is null or serving_amount > 0),
  package_amount numeric(9,2) check (package_amount is null or package_amount > 0),
  nutrients      jsonb not null
    check (jsonb_typeof(nutrients) = 'object' and pg_column_size(nutrients) < 16384),
  source         text not null check (source in ('user', 'off', 'usda', 'staple')),
  source_id      text,
  source_url     text,
  note           text check (note is null or length(note) <= 1000),
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists foods_user_source_id_key
  on public.foods (user_id, source, source_id) where source_id is not null;
create index if not exists foods_user_updated_idx
  on public.foods (user_id, updated_at desc);

drop trigger if exists foods_updated_at on public.foods;
create trigger foods_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- food_entries
-- -----------------------------------------------------------------------------
create table if not exists public.food_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users(id) on delete cascade,
  food_day   date not null,
  meal_id    text not null check (length(meal_id) <= 40),
  meal_name  text not null check (length(meal_name) <= 60),
  eaten_at   timestamptz not null default now(),
  food_id    uuid references public.foods(id) on delete set null,
  name       text not null check (length(name) between 1 and 200),
  brand      text check (brand is null or length(brand) <= 200),
  quantity   numeric(9,3) not null check (quantity > 0 and quantity <= 100000),
  unit       text not null check (unit in ('g', 'ml', 'oz', 'fl_oz', 'serving', 'package', 'quick')),
  grams      numeric(9,2),
  food       jsonb check (food is null or (jsonb_typeof(food) = 'object' and pg_column_size(food) < 16384)),
  nutrients  jsonb not null
    check (jsonb_typeof(nutrients) = 'object' and pg_column_size(nutrients) < 16384),
  note       text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_entries_user_day_idx
  on public.food_entries (user_id, food_day);
create index if not exists food_entries_user_eaten_idx
  on public.food_entries (user_id, eaten_at desc);

drop trigger if exists food_entries_updated_at on public.food_entries;
create trigger food_entries_updated_at
  before update on public.food_entries
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row security
-- -----------------------------------------------------------------------------
alter table public.foods enable row level security;
alter table public.food_entries enable row level security;

-- A food you may use: one you own.
create or replace function public.can_use_food(p_food_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.foods f
     where f.id = p_food_id
       and f.user_id = (select auth.uid())
  );
$$;
revoke execute on function public.can_use_food(uuid) from public, anon;
grant execute on function public.can_use_food(uuid) to authenticated, service_role;

drop policy if exists "foods: own rows" on public.foods;
create policy "foods: own rows" on public.foods
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "food_entries: own rows" on public.food_entries;
create policy "food_entries: own rows" on public.food_entries
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (food_id is null or public.can_use_food(food_id))
  );

grant select, insert, update, delete on public.foods, public.food_entries to authenticated;
