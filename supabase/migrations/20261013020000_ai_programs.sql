-- =============================================================================
-- Phase 4: AI-generated programs and next-session adjustments
-- =============================================================================

-- Percent-of-1RM targets (5/3/1, Sheiko) are kept alongside the computed weight,
-- so the weight can be recalculated when your max changes.
alter table public.routine_exercises
  add column target_percent_1rm numeric(5,2)
    check (target_percent_1rm is null or target_percent_1rm between 30 and 110);

-- -----------------------------------------------------------------------------
-- routine_adjustments: "next time, do X" suggestions after a routine workout
-- -----------------------------------------------------------------------------
create type public.adjustment_action as enum ('increase', 'hold', 'deload', 'adjust_reps');
create type public.adjustment_status as enum ('pending', 'applied', 'dismissed');

create table public.routine_adjustments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references public.users (id) on delete cascade,
  session_id           uuid not null references public.workout_sessions (id) on delete cascade,
  routine_exercise_id  uuid not null references public.routine_exercises (id) on delete cascade,
  action               public.adjustment_action not null,
  current_weight_kg    numeric(7,3),
  suggested_weight_kg  numeric(7,3) check (suggested_weight_kg is null or suggested_weight_kg >= 0),
  suggested_reps       smallint check (suggested_reps is null or suggested_reps between 1 and 100),
  suggested_reps_max   smallint check (suggested_reps_max is null or suggested_reps_max between 1 and 100),
  reason               text not null,
  source               text not null default 'ai' check (source in ('ai', 'rules')),
  status               public.adjustment_status not null default 'pending',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (session_id, routine_exercise_id)
);

create index routine_adjustments_user_status_idx on public.routine_adjustments (user_id, status);
create index routine_adjustments_routine_exercise_idx on public.routine_adjustments (routine_exercise_id);

create trigger routine_adjustments_updated_at
  before update on public.routine_adjustments
  for each row execute function public.set_updated_at();

alter table public.routine_adjustments enable row level security;

create policy "routine_adjustments: all own" on public.routine_adjustments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.user_id = (select auth.uid()))
  );

grant select, insert, update, delete on public.routine_adjustments to authenticated;

-- Apply a suggestion to the routine in one step (RLS still applies: invoker).
create or replace function public.apply_routine_adjustment(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.routine_adjustments;
begin
  select * into a from public.routine_adjustments where id = p_id and status = 'pending';
  if not found then
    raise exception 'Adjustment not found or already handled';
  end if;

  update public.routine_exercises re
     set target_weight_kg = coalesce(a.suggested_weight_kg, re.target_weight_kg),
         target_reps      = coalesce(a.suggested_reps, re.target_reps),
         target_reps_max  = case when a.suggested_reps is not null then a.suggested_reps_max else re.target_reps_max end,
         -- A manual weight now overrides the percentage
         target_percent_1rm = case when a.suggested_weight_kg is not null then null else re.target_percent_1rm end
   where re.id = a.routine_exercise_id;

  update public.routine_adjustments set status = 'applied' where id = p_id;
end;
$$;

grant execute on function public.apply_routine_adjustment(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- ai_usage: one row per Claude call, used for a daily limit and cost tracking.
-- Written only by Edge Functions (service role); users can read their own.
-- -----------------------------------------------------------------------------
create table public.ai_usage (
  id             bigint generated always as identity primary key,
  user_id        uuid not null references public.users (id) on delete cascade,
  kind           text not null check (kind in ('generate_plan', 'adjust_session')),
  model          text,
  input_tokens   integer,
  output_tokens  integer,
  ok             boolean not null default true,
  created_at     timestamptz not null default now()
);

create index ai_usage_user_created_idx on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
create policy "ai_usage: read own" on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.ai_usage to authenticated;
