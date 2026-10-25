-- =============================================================================
-- Automatic deload weeks
--
--  * routines.is_deload marks a lighter week in a program (about half the sets,
--    about 10% less weight, nothing to failure). New programs get one every few
--    weeks; programs.deload_every records the interval used.
--  * When you keep missing your targets, the post-workout check offers a deload
--    now (programs.deload_suggestion). Applying it (apply_early_deload) slots a
--    deload week in at your next week: your next planned deload moves up if it
--    was close, otherwise the program gets one week longer.
--  * "Next time" changes don't carry into deload weeks, so a deload stays light.
-- =============================================================================

alter table public.routines
  add column if not exists is_deload boolean not null default false;

alter table public.programs
  add column if not exists deload_every smallint check (deload_every is null or deload_every between 2 and 12),
  add column if not exists deload_suggestion text,
  add column if not exists deload_suggested_at timestamptz,
  -- Missed targets before this time don't count toward another early deload.
  add column if not exists deload_checked_from timestamptz;

-- -----------------------------------------------------------------------------
-- Round a kg weight to what you can load: 5 lb or 2.5 kg steps.
-- (Same as roundLoadKg in supabase/functions/_shared/units.ts.)
-- -----------------------------------------------------------------------------
create or replace function public.round_load_kg(p_kg numeric, p_unit public.unit_system)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kg is null then null
    when p_kg <= 0 then 0
    when p_unit = 'imperial' then round(round(p_kg * 2.2046226218 / 5) * 5 / 2.2046226218, 3)
    else round(p_kg / 2.5) * 2.5
  end;
$$;

-- -----------------------------------------------------------------------------
-- Starting (or restarting) a program clears any old early-deload offer.
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
  update public.programs
     set is_active = true, started_at = now(),
         deload_suggestion = null, deload_suggested_at = null, deload_checked_from = null
   where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- program_progress also says whether the next workout is a deload and passes
-- on any early-deload offer. (New columns change the return type: recreate.)
-- -----------------------------------------------------------------------------
drop function if exists public.program_progress(uuid);
create function public.program_progress(p_program_id uuid default null)
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
  next_day      smallint,
  next_is_deload boolean,
  deload_suggestion text
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
    select r.id, r.name, r.program_week, r.program_day, r.is_deload
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
         nxt.id, nxt.name, nxt.program_week, nxt.program_day,
         coalesce(nxt.is_deload, false),
         p.deload_suggestion
    from p left join nxt on true;
$$;
grant execute on function public.program_progress(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Applying a "next time" change carries it to the same day in later weeks,
-- except deload weeks, which stay light.
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
       and not later.is_deload
       and x.exercise_id = re.exercise_id;
  end if;

  update public.routine_adjustments set status = 'applied' where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Take a deload week now. It starts with your next week: the week of your next
-- workout if you haven't done any of it yet, otherwise the week after. It is a
-- lighter copy of your last training week: half the sets (rounded up), 10% less
-- weight, RPE at most 7. If a planned deload was coming within 3 weeks it moves
-- up to this week instead, so the program keeps its length; otherwise every
-- later week moves back one and the program gets a week longer.
-- Returns the deload's week number.
-- -----------------------------------------------------------------------------
create or replace function public.apply_early_deload(p_program_id uuid)
returns smallint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  p public.programs;
  pr record;
  unit public.unit_system;
  w smallint;        -- the new deload week
  ref smallint;      -- the training week it is based on
  pulled smallint;   -- a planned deload that moves up, if any
  last_week smallint;
  src public.routines;
  new_id uuid;
begin
  select * into p from public.programs where id = p_program_id;
  if not found then
    raise exception 'Program not found';
  end if;
  if not p.is_active then
    raise exception 'Start this program first';
  end if;
  select * into pr from public.program_progress(p_program_id);
  if pr.next_week is null then
    raise exception 'This program is already finished';
  end if;

  w := pr.next_week;
  if exists (select 1 from public.routines
              where program_id = p.id and program_week = w and id = any (pr.done_routine_ids)) then
    w := w + 1;
  end if;
  select max(program_week) into last_week from public.routines where program_id = p.id;
  if w > last_week then
    raise exception 'Your program ends this week, so there is no week left to deload. Take it easy next week, then build your next program.';
  end if;

  -- Already lighter that week or the week before: nothing to change.
  if exists (select 1 from public.routines where program_id = p.id and program_week in (w - 1, w) and is_deload) then
    update public.programs
       set deload_suggestion = null, deload_suggested_at = null, deload_checked_from = now()
     where id = p.id;
    return (select max(program_week) from public.routines
             where program_id = p.id and program_week in (w - 1, w) and is_deload);
  end if;

  select max(program_week) into ref
    from public.routines where program_id = p.id and program_week < w and not is_deload;
  if ref is null then
    raise exception 'There is no training week yet to base a deload on';
  end if;

  -- A planned deload within 3 weeks that you haven't started moves up.
  select min(r.program_week) into pulled
    from public.routines r
   where r.program_id = p.id and r.is_deload and r.program_week > w and r.program_week <= w + 3
     and not exists (select 1 from public.routines d
                      where d.program_id = p.id and d.program_week = r.program_week
                        and d.id = any (pr.done_routine_ids));
  if pulled is not null then
    delete from public.routines where program_id = p.id and program_week = pulled;
  elsif last_week >= 52 then
    raise exception 'This program is as long as it can be';
  end if;

  -- Move week w (up to the pulled deload, or to the end) back by one.
  set constraints public.routines_program_slot_unique deferred;
  update public.routines
     set program_week = program_week + 1,
         name = regexp_replace(name, '^Week [0-9]+ · ', 'Week ' || (program_week + 1) || ' · ')
   where program_id = p.id and program_week >= w and (pulled is null or program_week < pulled);

  select u.unit_system into unit from public.users u where u.id = p.user_id;

  for src in
    select * from public.routines where program_id = p.id and program_week = ref order by program_day
  loop
    insert into public.routines (user_id, name, description, ai_generated, program_id, program_week, program_day, is_deload)
    values (src.user_id,
            'Week ' || w || ' · ' || regexp_replace(src.name, '^Week [0-9]+ · ', ''),
            src.description, src.ai_generated, p.id, w, src.program_day, true)
    returning id into new_id;

    insert into public.routine_exercises
      (routine_id, exercise_id, position, superset_group, target_sets, target_reps, target_reps_max,
       target_weight_kg, target_percent_1rm, target_rpe, warmup_sets, rest_seconds, notes)
    select new_id, x.exercise_id, x.position, x.superset_group,
           greatest(1, ceil(x.target_sets / 2.0))::smallint,
           x.target_reps, x.target_reps_max,
           public.round_load_kg(x.target_weight_kg * 0.9, coalesce(unit, 'imperial')),
           case when x.target_percent_1rm is null then null else greatest(30, round(x.target_percent_1rm * 0.9, 1)) end,
           case when x.target_rpe is null then null else least(x.target_rpe, 7) end,
           x.warmup_sets, x.rest_seconds,
           'Deload: lighter on purpose. Stop with 3 or more reps left in the tank.'
      from public.routine_exercises x
     where x.routine_id = src.id;
  end loop;

  update public.programs
     set weeks = case when pulled is null then least(52, weeks + 1) else weeks end,
         deload_suggestion = null, deload_suggested_at = null, deload_checked_from = now()
   where id = p.id;
  return w;
end;
$$;
grant execute on function public.apply_early_deload(uuid) to authenticated;

-- "Not now": hide the offer, and only misses after this count toward the next one.
create or replace function public.dismiss_early_deload(p_program_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.programs
     set deload_suggestion = null, deload_suggested_at = null, deload_checked_from = now()
   where id = p_program_id;
$$;
grant execute on function public.dismiss_early_deload(uuid) to authenticated;
