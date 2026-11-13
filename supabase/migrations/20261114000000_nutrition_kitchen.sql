-- Nutrition kitchen (N4): recipes, batches, usual meals and the pantry
--
--  * foods.source gains 'recipe': a saved recipe is also a food (per 100 g of
--    the finished dish), so logging, recents and search reuse the diary path.
--  * foods.price_cents / price_amount: what a food cost and how many g (ml)
--    that price bought. Optional; used for protein-per-dollar.
--  * food_entries.status: 'planned' entries (a meal you mean to eat) are kept
--    apart from what you actually ate until you confirm them.
--  * recipes: ingredients are stored on the recipe as a list (each with its
--    own nutrient snapshot), so deleting a food never breaks a recipe.
--  * batches: a cooked batch split into portions you log one at a time.
--  * usuals: a meal you eat often, saved as entry templates.
--  * pantry_items: what you have at home, where, and until when.
--
-- Row security follows 20261112000000_nutrition_diary.sql: signed-in only,
-- your rows only, and a row can only point at a food you own. Nothing here
-- runs as security definer.

-- -----------------------------------------------------------------------------
-- foods and food_entries: new columns
-- -----------------------------------------------------------------------------
alter table public.foods
  drop constraint if exists foods_source_check;
alter table public.foods
  add constraint foods_source_check check (source in ('user', 'off', 'usda', 'staple', 'recipe'));

alter table public.foods
  add column if not exists price_cents integer check (price_cents is null or price_cents >= 0),
  add column if not exists price_amount numeric(9,2) check (price_amount is null or price_amount > 0);

alter table public.food_entries
  add column if not exists status text not null default 'logged' check (status in ('logged', 'planned'));

-- -----------------------------------------------------------------------------
-- recipes
-- -----------------------------------------------------------------------------
create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.users(id) on delete cascade,
  name          text not null check (length(name) between 1 and 200),
  servings      numeric(6,2) not null check (servings > 0),
  cooked_weight numeric(9,2) check (cooked_weight is null or cooked_weight > 0),
  liquid        boolean not null default false,
  note          text check (note is null or length(note) <= 1000),
  items         jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 32768),
  food_id       uuid references public.foods(id) on delete set null,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists recipes_user_updated_idx
  on public.recipes (user_id, updated_at desc);

drop trigger if exists recipes_updated_at on public.recipes;
create trigger recipes_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- batches
-- -----------------------------------------------------------------------------
create table if not exists public.batches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.users(id) on delete cascade,
  recipe_id      uuid references public.recipes(id) on delete set null,
  food_id        uuid not null references public.foods(id) on delete cascade,
  name           text not null check (length(name) between 1 and 200),
  made_on        date not null,
  portions       numeric(6,2) not null check (portions > 0),
  portions_left  numeric(6,2) not null check (portions_left >= 0),
  portion_amount numeric(9,2) not null check (portion_amount > 0),
  use_by         date,
  finished       boolean not null default false,
  note           text check (note is null or length(note) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists batches_user_updated_idx
  on public.batches (user_id, updated_at desc);

drop trigger if exists batches_updated_at on public.batches;
create trigger batches_updated_at
  before update on public.batches
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- usuals
-- -----------------------------------------------------------------------------
create table if not exists public.usuals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users(id) on delete cascade,
  name         text not null check (length(name) between 1 and 80),
  place        text check (place is null or length(place) <= 60),
  meal_id      text check (meal_id is null or length(meal_id) <= 40),
  items        jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 32768),
  use_count    integer not null default 0 check (use_count >= 0),
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists usuals_user_updated_idx
  on public.usuals (user_id, updated_at desc);

drop trigger if exists usuals_updated_at on public.usuals;
create trigger usuals_updated_at
  before update on public.usuals
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- pantry_items
-- -----------------------------------------------------------------------------
create table if not exists public.pantry_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.users(id) on delete cascade,
  food_id    uuid not null references public.foods(id) on delete cascade,
  quantity   numeric(9,2) not null check (quantity >= 0),
  unit       text not null check (unit in ('g', 'ml', 'serving', 'package')),
  location   text not null default 'cupboard' check (location in ('fridge', 'freezer', 'cupboard')),
  added_on   date not null default current_date,
  opened_on  date,
  use_by     date,
  note       text check (note is null or length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pantry_items_user_updated_idx
  on public.pantry_items (user_id, updated_at desc);

drop trigger if exists pantry_items_updated_at on public.pantry_items;
create trigger pantry_items_updated_at
  before update on public.pantry_items
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row security
-- -----------------------------------------------------------------------------
alter table public.recipes enable row level security;
alter table public.batches enable row level security;
alter table public.usuals enable row level security;
alter table public.pantry_items enable row level security;

drop policy if exists "recipes: own rows" on public.recipes;
create policy "recipes: own rows" on public.recipes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (food_id is null or public.can_use_food(food_id))
  );

drop policy if exists "batches: own rows" on public.batches;
create policy "batches: own rows" on public.batches
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.can_use_food(food_id)
  );

drop policy if exists "usuals: own rows" on public.usuals;
create policy "usuals: own rows" on public.usuals
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "pantry_items: own rows" on public.pantry_items;
create policy "pantry_items: own rows" on public.pantry_items
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and public.can_use_food(food_id)
  );

grant select, insert, update, delete
  on public.recipes, public.batches, public.usuals, public.pantry_items
  to authenticated;
