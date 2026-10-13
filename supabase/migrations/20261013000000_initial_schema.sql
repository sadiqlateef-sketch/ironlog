-- =============================================================================
-- Phase 1: Initial schema for the strength training app
--
-- Conventions
--   * All weights are stored in KILOGRAMS. The UI converts to lb when the user
--     prefers imperial units. One canonical unit keeps 1RM math and charts sane.
--   * Every user-owned table has Row Level Security (RLS) enabled. A logged-in
--     user can only ever see and change their own rows.
--   * `(select auth.uid())` is used inside policies instead of `auth.uid()` so
--     Postgres evaluates it once per query instead of once per row.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.set_type as enum ('warmup', 'normal', 'drop', 'failure');

create type public.muscle_group as enum (
  'chest', 'upper_back', 'lats', 'lower_back', 'traps',
  'front_delts', 'side_delts', 'rear_delts',
  'biceps', 'triceps', 'forearms',
  'abs', 'obliques',
  'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves',
  'neck'
);

create type public.equipment_type as enum (
  'barbell', 'dumbbell', 'kettlebell', 'machine', 'cable',
  'bodyweight', 'band', 'smith_machine', 'ez_bar', 'trap_bar', 'other'
);

create type public.exercise_mechanic as enum ('compound', 'isolation');

create type public.unit_system as enum ('metric', 'imperial');

create type public.session_source as enum ('web', 'phone', 'watch');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- users: app profile, 1:1 with Supabase Auth's auth.users
-- -----------------------------------------------------------------------------
create table public.users (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null,
  display_name    text,
  -- e.g. {"height_cm":178,"bodyweight_kg":82.5,"birth_year":1998,"sex":"male",
  --       "training_age_years":3,"resting_hr":58,"max_hr":190}
  physical_stats  jsonb not null default '{}'::jsonb,
  unit_system     public.unit_system not null default 'imperial',
  -- Barbell + plates the user actually owns, used by the plate calculator.
  bar_weight_kg   numeric(6,2) not null default 20.41,  -- 45 lb
  available_plates_kg numeric(6,2)[] not null
                  default array[20.41, 15.88, 11.34, 4.54, 2.27, 1.13]::numeric(6,2)[], -- 45/35/25/10/5/2.5 lb
  default_rest_seconds integer not null default 120 check (default_rest_seconds between 0 and 1800),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- Create the profile row automatically when someone signs up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email)
  values (new.id, coalesce(new.email, ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- exercises: global library (created_by is null) + user custom exercises
-- -----------------------------------------------------------------------------
create table public.exercises (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text not null,
  primary_muscle     public.muscle_group not null,
  secondary_muscles  public.muscle_group[] not null default '{}',
  equipment          public.equipment_type not null,
  mechanic           public.exercise_mechanic not null default 'compound',
  animation_url      text,          -- GIF / video of proper form (placeholder for now)
  instructions       text,
  created_by         uuid references public.users (id) on delete cascade, -- null = built-in
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Slugs are unique within the built-in library and within each user's customs.
create unique index exercises_global_slug_key on public.exercises (slug) where created_by is null;
create unique index exercises_custom_slug_key on public.exercises (created_by, slug) where created_by is not null;
create index exercises_primary_muscle_idx on public.exercises (primary_muscle);
create index exercises_created_by_idx on public.exercises (created_by);

create trigger exercises_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- routines: a saved workout template (e.g. "Push A"), possibly AI generated
-- -----------------------------------------------------------------------------
create table public.routines (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.users (id) on delete cascade,
  name          text not null,
  description   text,
  ai_generated  boolean not null default false,
  -- Phase 4: methodology ("531", "sheiko", "rp"), split, week, the prompt, etc.
  ai_metadata   jsonb,
  position      integer not null default 0,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index routines_user_id_idx on public.routines (user_id);

create trigger routines_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- routine_exercises: the exercises (and targets) inside a routine
-- -----------------------------------------------------------------------------
create table public.routine_exercises (
  id               uuid primary key default gen_random_uuid(),
  routine_id       uuid not null references public.routines (id) on delete cascade,
  exercise_id      uuid not null references public.exercises (id) on delete restrict,
  position         integer not null,                 -- order within the routine
  superset_group   smallint,                         -- same number = performed as a superset
  target_sets      smallint not null default 3 check (target_sets between 1 and 20),
  target_reps      smallint not null default 8 check (target_reps between 1 and 100),  -- low end of range
  target_reps_max  smallint check (target_reps_max is null or target_reps_max >= target_reps), -- high end
  target_weight_kg numeric(7,3) check (target_weight_kg is null or target_weight_kg >= 0),
  target_rpe       numeric(3,1) check (target_rpe is null or target_rpe between 1 and 10),
  warmup_sets      smallint not null default 0 check (warmup_sets between 0 and 10),
  rest_seconds     integer not null default 120 check (rest_seconds between 0 and 1800),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (routine_id, position)
);

create index routine_exercises_routine_id_idx on public.routine_exercises (routine_id);
create index routine_exercises_exercise_id_idx on public.routine_exercises (exercise_id);

create trigger routine_exercises_updated_at
  before update on public.routine_exercises
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workout_sessions: one actual workout that was performed
-- -----------------------------------------------------------------------------
create table public.workout_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references public.users (id) on delete cascade,
  routine_id    uuid references public.routines (id) on delete set null,
  name          text,
  start_time    timestamptz not null default now(),
  end_time      timestamptz check (end_time is null or end_time >= start_time),
  -- Total working volume in kg (sum of weight x reps, warm-ups excluded).
  -- Maintained automatically by a trigger on workout_sets.
  volume        numeric(12,2) not null default 0,
  source        public.session_source not null default 'web',
  -- Heart-rate summary, filled in from heart_rate_samples (Phase 6).
  avg_hr        smallint,
  max_hr        smallint,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index workout_sessions_user_start_idx on public.workout_sessions (user_id, start_time desc);
create index workout_sessions_routine_id_idx on public.workout_sessions (routine_id);

-- Only one unfinished workout per user at a time.
create unique index workout_sessions_one_active_per_user
  on public.workout_sessions (user_id) where end_time is null;

create trigger workout_sessions_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- workout_sets: every set logged during a session
-- -----------------------------------------------------------------------------
create table public.workout_sets (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.workout_sessions (id) on delete cascade,
  -- Copied from the session so "my history for this exercise" is one index lookup.
  user_id         uuid not null default auth.uid() references public.users (id) on delete cascade,
  exercise_id     uuid not null references public.exercises (id) on delete restrict,
  exercise_order  smallint not null default 1,   -- which exercise slot in the session
  set_number      smallint not null check (set_number >= 1),
  set_type        public.set_type not null default 'normal',
  weight          numeric(7,3) not null default 0 check (weight >= 0), -- kg
  reps            smallint not null default 0 check (reps between 0 and 999),
  rpe             numeric(3,1) check (rpe is null or rpe between 1 and 10),
  superset_group  smallint,                      -- same number = superset
  parent_set_id   uuid references public.workout_sets (id) on delete cascade, -- drop set chains
  is_completed    boolean not null default false,
  completed_at    timestamptz,
  -- Epley estimated 1RM for charting. Null for warm-ups and very high rep sets.
  estimated_1rm   numeric(7,2) generated always as (
                    case
                      when set_type <> 'warmup' and reps between 1 and 12 and weight > 0
                        then round(weight * (1 + reps / 30.0), 2)
                    end
                  ) stored,
  notes           text,
  -- Set by the phone or watch when created offline, so a retried sync never duplicates.
  client_id       uuid unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (session_id, exercise_order, set_number)
);

create index workout_sets_session_idx on public.workout_sets (session_id, exercise_order, set_number);
create index workout_sets_user_exercise_idx on public.workout_sets (user_id, exercise_id, created_at desc);
create index workout_sets_exercise_id_idx on public.workout_sets (exercise_id);
create index workout_sets_parent_set_id_idx on public.workout_sets (parent_set_id);

create trigger workout_sets_updated_at
  before update on public.workout_sets
  for each row execute function public.set_updated_at();

-- Stamp completed_at the moment a set is ticked off (drives the rest timer + history).
create or replace function public.stamp_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_completed and new.completed_at is null then
    new.completed_at = now();
  elsif not new.is_completed then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger workout_sets_completed_at
  before insert or update of is_completed on public.workout_sets
  for each row execute function public.stamp_set_completed_at();

-- Keep workout_sessions.volume in sync whenever sets change.
create or replace function public.refresh_session_volume()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected uuid[];
begin
  if tg_op = 'DELETE' then
    affected := array[old.session_id];
  elsif tg_op = 'UPDATE' then
    affected := array[new.session_id, old.session_id];
  else
    affected := array[new.session_id];
  end if;

  update public.workout_sessions s
     set volume = coalesce((
           select sum(ws.weight * ws.reps)
             from public.workout_sets ws
            where ws.session_id = s.id
              and ws.is_completed
              and ws.set_type <> 'warmup'
         ), 0)
   where s.id = any(affected);

  return null;
end;
$$;

create trigger workout_sets_refresh_volume
  after insert or update or delete on public.workout_sets
  for each row execute function public.refresh_session_volume();

-- -----------------------------------------------------------------------------
-- heart_rate_samples: biometric stream from the Wear OS watch (Phase 6)
-- -----------------------------------------------------------------------------
create table public.heart_rate_samples (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.workout_sessions (id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  recorded_at  timestamptz not null,
  bpm          smallint not null check (bpm between 20 and 250),
  source       public.session_source not null default 'watch',
  unique (session_id, recorded_at)
);

create index heart_rate_samples_session_idx on public.heart_rate_samples (session_id, recorded_at);
create index heart_rate_samples_user_id_idx on public.heart_rate_samples (user_id);

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.users              enable row level security;
alter table public.exercises          enable row level security;
alter table public.routines           enable row level security;
alter table public.routine_exercises  enable row level security;
alter table public.workout_sessions   enable row level security;
alter table public.workout_sets       enable row level security;
alter table public.heart_rate_samples enable row level security;

-- users: you can read and edit only your own profile. Rows are created by the
-- signup trigger and removed when the auth user is deleted.
create policy "users: read own" on public.users
  for select to authenticated using (id = (select auth.uid()));
create policy "users: update own" on public.users
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- exercises: everyone signed in sees the built-in library plus their own customs.
create policy "exercises: read library and own" on public.exercises
  for select to authenticated
  using (created_by is null or created_by = (select auth.uid()));
create policy "exercises: insert own" on public.exercises
  for insert to authenticated with check (created_by = (select auth.uid()));
create policy "exercises: update own" on public.exercises
  for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy "exercises: delete own" on public.exercises
  for delete to authenticated using (created_by = (select auth.uid()));

-- routines
create policy "routines: all own" on public.routines
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- routine_exercises: allowed when the parent routine is yours.
create policy "routine_exercises: all via own routine" on public.routine_exercises
  for all to authenticated
  using (exists (select 1 from public.routines r
                  where r.id = routine_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.routines r
                       where r.id = routine_id and r.user_id = (select auth.uid())));

-- workout_sessions
create policy "workout_sessions: all own" on public.workout_sessions
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- workout_sets: must be yours AND belong to one of your sessions.
create policy "workout_sets: all own" on public.workout_sets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.user_id = (select auth.uid()))
  );

-- heart_rate_samples
create policy "heart_rate_samples: all own" on public.heart_rate_samples
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.user_id = (select auth.uid()))
  );

-- Explicit grants (RLS above still decides which rows are visible).
grant usage on schema public to authenticated;
grant select, update on public.users to authenticated;
grant select, insert, update, delete on
  public.exercises, public.routines, public.routine_exercises,
  public.workout_sessions, public.workout_sets, public.heart_rate_samples
  to authenticated;
revoke all on all tables in schema public from anon;

-- =============================================================================
-- Helper functions used by the app
-- =============================================================================

-- "Last time you did this exercise": every set from your most recent finished
-- session that included it. Powers the inline previous-performance display.
create or replace function public.get_last_performance(p_exercise_id uuid)
returns table (
  session_id    uuid,
  performed_at  timestamptz,
  set_number    smallint,
  set_type      public.set_type,
  weight        numeric,
  reps          smallint,
  rpe           numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with last_session as (
    select ws.session_id, s.start_time
      from public.workout_sets ws
      join public.workout_sessions s on s.id = ws.session_id
     where ws.exercise_id = p_exercise_id
       and ws.user_id = (select auth.uid())
       and ws.is_completed
       and s.end_time is not null
     order by s.start_time desc
     limit 1
  )
  select ws.session_id, ls.start_time, ws.set_number, ws.set_type, ws.weight, ws.reps, ws.rpe
    from public.workout_sets ws
    join last_session ls on ls.session_id = ws.session_id
   where ws.exercise_id = p_exercise_id
     and ws.is_completed
   order by ws.exercise_order, ws.set_number;
$$;

grant execute on function public.get_last_performance(uuid) to authenticated;
