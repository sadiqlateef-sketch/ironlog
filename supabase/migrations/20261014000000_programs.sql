-- =============================================================================
-- Multi-week programs
--
-- A program is a block of training (e.g. 8 weeks x 4 days) with every workout
-- mapped out in advance: one routine per week and day, so each one can be
-- edited on its own. You run one program at a time; its next workout is the
-- first one (by week, then day) you haven't finished since you started it.
-- =============================================================================

create table public.programs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references public.users (id) on delete cascade,
  name              text not null,
  methodology       text,
  summary           text,
  progression_rule  text,
  weeks             smallint not null default 1 check (weeks between 1 and 52),
  days_per_week     smallint not null default 1 check (days_per_week between 1 and 7),
  ai_generated      boolean not null default false,
  ai_metadata       jsonb,
  is_active         boolean not null default false,
  started_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index programs_user_id_idx on public.programs (user_id);
-- One active program per person.
create unique index programs_one_active on public.programs (user_id) where is_active;

create trigger programs_updated_at
  before update on public.programs
  for each row execute function public.set_updated_at();

alter table public.programs enable row level security;
create policy "programs: all own" on public.programs
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.programs to authenticated;

-- Each program workout is a routine tagged with its week and day.
alter table public.routines
  add column program_id   uuid references public.programs (id) on delete cascade,
  add column program_week smallint check (program_week between 1 and 52),
  add column program_day  smallint check (program_day between 1 and 7),
  add constraint routines_program_slot check ((program_id is null) = (program_week is null) and (program_id is null) = (program_day is null)),
  add constraint routines_program_slot_unique unique (program_id, program_week, program_day);

create index routines_program_id_idx on public.routines (program_id);

-- Programs made before this migration were one routine per day with the
-- program in ai_metadata. Turn each into a 1-week program.
with legacy as (
  select distinct on ((ai_metadata->>'program_id'))
         (ai_metadata->>'program_id')::uuid as id, user_id, ai_metadata, created_at
    from public.routines
   where ai_generated and ai_metadata ? 'program_id' and program_id is null
   order by (ai_metadata->>'program_id'), created_at
)
insert into public.programs (id, user_id, name, methodology, summary, progression_rule, weeks, days_per_week, ai_generated, ai_metadata, created_at)
select l.id, l.user_id,
       coalesce(l.ai_metadata->>'program_name', 'Program'),
       l.ai_metadata->>'methodology', l.ai_metadata->>'summary', l.ai_metadata->>'progression_rule',
       1,
       greatest(1, least(7, (select count(*) from public.routines r where r.ai_metadata->>'program_id' = l.id::text))),
       true, l.ai_metadata, l.created_at
  from legacy l;

update public.routines r
   set program_id = (r.ai_metadata->>'program_id')::uuid,
       program_week = 1,
       program_day = least(7, greatest(1, coalesce((r.ai_metadata->>'day_index')::int, 1)))
 where r.ai_generated and r.ai_metadata ? 'program_id' and r.program_id is null
   and exists (select 1 from public.programs p where p.id = (r.ai_metadata->>'program_id')::uuid);

-- -----------------------------------------------------------------------------
-- Make a program the active one and start it from week 1, day 1.
-- (Restarting an active program also goes back to the beginning.)
-- -----------------------------------------------------------------------------
create or replace function public.start_program(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.programs where id = p_id) then
    raise exception 'Program not found';
  end if;
  update public.programs set is_active = false where is_active and id <> p_id;
  update public.programs set is_active = true, started_at = now() where id = p_id;
end;
$$;
grant execute on function public.start_program(uuid) to authenticated;

create or replace function public.stop_program(p_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.programs set is_active = false where id = p_id;
$$;
grant execute on function public.stop_program(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Where you are in a program: the next workout and how many are done.
-- With no id, it reports on your active program. A workout counts as done once
-- a finished session for it started after the program did.
-- -----------------------------------------------------------------------------
create or replace function public.program_progress(p_program_id uuid default null)
returns table (
  program_id    uuid,
  program_name  text,
  weeks         smallint,
  days_per_week smallint,
  is_active     boolean,
  total         integer,
  done          integer,
  done_routine_ids uuid[],
  next_routine_id  uuid,
  next_routine_name text,
  next_week     smallint,
  next_day      smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with p as (
    select * from public.programs
     where (p_program_id is null and is_active) or id = p_program_id
     limit 1
  ),
  r as (
    select r.id, r.name, r.program_week, r.program_day
      from public.routines r join p on r.program_id = p.id
  ),
  finished as (
    select distinct s.routine_id
      from public.workout_sessions s join p on true
     where p.started_at is not null
       and s.start_time >= p.started_at
       and s.end_time is not null
       and s.routine_id in (select id from r)
  ),
  nxt as (
    select r.* from r
     where r.id not in (select routine_id from finished)
     order by r.program_week, r.program_day
     limit 1
  )
  select p.id, p.name, p.weeks, p.days_per_week, p.is_active,
         (select count(*)::int from r),
         (select count(*)::int from finished),
         coalesce((select array_agg(routine_id) from finished), '{}'),
         nxt.id, nxt.name, nxt.program_week, nxt.program_day
    from p left join nxt on true;
$$;
grant execute on function public.program_progress(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Applying a "next time" suggestion inside a program also carries it forward:
-- the same exercise on the same day in later weeks moves by the same amount,
-- so the program's week-to-week progression is kept.
-- -----------------------------------------------------------------------------
create or replace function public.apply_routine_adjustment(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  a public.routine_adjustments;
  re public.routine_exercises;
  rt public.routines;
  delta numeric;
begin
  select * into a from public.routine_adjustments where id = p_id and status = 'pending';
  if not found then
    raise exception 'Adjustment not found or already handled';
  end if;
  select * into re from public.routine_exercises where id = a.routine_exercise_id;
  select * into rt from public.routines where id = re.routine_id;

  update public.routine_exercises x
     set target_weight_kg = coalesce(a.suggested_weight_kg, x.target_weight_kg),
         target_reps      = coalesce(a.suggested_reps, x.target_reps),
         target_reps_max  = case when a.suggested_reps is not null then a.suggested_reps_max else x.target_reps_max end,
         -- A manual weight now overrides the percentage
         target_percent_1rm = case when a.suggested_weight_kg is not null then null else x.target_percent_1rm end
   where x.id = a.routine_exercise_id;

  if rt.program_id is not null then
    delta := a.suggested_weight_kg - coalesce(a.current_weight_kg, re.target_weight_kg);
    update public.routine_exercises x
       set target_weight_kg = case
             when a.suggested_weight_kg is null then x.target_weight_kg
             when x.target_weight_kg is null or delta is null then a.suggested_weight_kg
             else greatest(0, x.target_weight_kg + delta) end,
           target_reps      = coalesce(a.suggested_reps, x.target_reps),
           target_reps_max  = case when a.suggested_reps is not null then a.suggested_reps_max else x.target_reps_max end,
           target_percent_1rm = case when a.suggested_weight_kg is not null then null else x.target_percent_1rm end
      from public.routines later
     where later.id = x.routine_id
       and later.program_id = rt.program_id
       and later.program_day = rt.program_day
       and later.program_week > rt.program_week
       and x.exercise_id = re.exercise_id;
  end if;

  update public.routine_adjustments set status = 'applied' where id = p_id;
end;
$$;
