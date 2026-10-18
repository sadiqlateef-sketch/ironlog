-- Smarter set logging
--
--  * workout_sets.rpe already existed; the logger now asks for it after each
--    set (as "reps left in the tank" or RPE, see users.effort_scale) and the
--    next-time suggestions use it.
--  * users.effort_scale: how the logger asks how hard a set was.
--      rir  (default) "how many more could you have done?" 0, 1, 2, 3, 4+
--      rpe  RPE 6 to 10
--      off  don't ask
--  * exercise_prefs.rest_seconds: your own rest time for an exercise, used in
--    every workout on the phone and the watch (it used to live on one phone).
--  * One side at a time: exercises.unilateral is the default for an exercise
--    (single-arm, single-leg, lunges...) and exercise_prefs.unilateral is your
--    own choice (null = use the default). Those sets log reps_left and
--    reps_right; reps stays the weaker side so volume, 1RM and progression keep
--    working as before.
--  * exercise_prefs.notes (already there) is shown on the exercise every time
--    you log it, e.g. "seat on 4".

alter table public.users
  add column if not exists effort_scale text not null default 'rir'
    check (effort_scale in ('rir', 'rpe', 'off'));

alter table public.exercise_prefs
  add column if not exists rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 1800),
  add column if not exists unilateral   boolean;

alter table public.exercises
  add column if not exists unilateral boolean not null default false;

update public.exercises set unilateral = true
 where created_by is null
   and tracking = 'weight_reps'
   and name ~* '(single[- ]arm|single[- ]leg|one[- ]arm|one[- ]leg|bulgarian|split squat|lunge|step[- ]?ups?|pistol|concentration curl)';

alter table public.workout_sets
  add column if not exists reps_left  smallint check (reps_left  is null or reps_left  between 0 and 999),
  add column if not exists reps_right smallint check (reps_right is null or reps_right between 0 and 999);

-- Keep reps in step with the two sides:
--  * both sides logged -> reps is the weaker side
--  * reps changed on its own (the watch logs one number) -> the old sides no longer apply
create or replace function public.workout_sets_sides()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.reps is distinct from old.reps
     and new.reps_left is not distinct from old.reps_left
     and new.reps_right is not distinct from old.reps_right then
    new.reps_left := null;
    new.reps_right := null;
  end if;
  if new.reps_left is not null and new.reps_right is not null then
    new.reps := least(new.reps_left, new.reps_right);
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sets_sides on public.workout_sets;
create trigger workout_sets_sides
  before insert or update of reps, reps_left, reps_right on public.workout_sets
  for each row execute function public.workout_sets_sides();

-- "Last time" now includes each side (the return type changes, so recreate it).
drop function if exists public.get_last_performance(uuid);
create function public.get_last_performance(p_exercise_id uuid)
returns table (
  session_id       uuid,
  performed_at     timestamptz,
  set_number       smallint,
  set_type         public.set_type,
  weight           numeric,
  reps             smallint,
  rpe              numeric,
  duration_seconds integer,
  distance_m       numeric,
  reps_left        smallint,
  reps_right       smallint
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
  select ws.session_id, ls.start_time, ws.set_number, ws.set_type, ws.weight, ws.reps, ws.rpe,
         ws.duration_seconds, ws.distance_m, ws.reps_left, ws.reps_right
    from public.workout_sets ws
    join last_session ls on ls.session_id = ws.session_id
   where ws.exercise_id = p_exercise_id
     and ws.is_completed
   order by ws.exercise_order, ws.set_number;
$$;
revoke execute on function public.get_last_performance(uuid) from public, anon;
grant execute on function public.get_last_performance(uuid) to authenticated, service_role;
