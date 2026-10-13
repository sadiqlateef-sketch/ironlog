-- =============================================================================
-- Phase 3: read-only helpers for the Progress screen.
-- All are SECURITY INVOKER, so Row Level Security still limits every row to
-- the signed-in user. Finished workouts only (end_time is not null).
-- =============================================================================

-- Exercises you've actually logged, most-trained first (for the 1RM chart picker).
create or replace function public.get_logged_exercises()
returns table (
  exercise_id    uuid,
  name           text,
  equipment      public.equipment_type,
  session_count  bigint,
  last_performed timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id, e.name, e.equipment, count(distinct s.id), max(s.start_time)
    from public.workout_sets ws
    join public.workout_sessions s on s.id = ws.session_id
    join public.exercises e on e.id = ws.exercise_id
   where ws.user_id = (select auth.uid())
     and ws.is_completed
     and ws.estimated_1rm is not null
     and s.end_time is not null
   group by e.id, e.name, e.equipment
   order by count(distinct s.id) desc, max(s.start_time) desc;
$$;

-- Best estimated 1RM per workout for one exercise, plus the set that produced it.
create or replace function public.get_e1rm_history(p_exercise_id uuid, p_since timestamptz default '-infinity')
returns table (
  session_id   uuid,
  performed_at timestamptz,
  e1rm         numeric,
  weight       numeric,
  reps         smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (s.id)
         s.id, s.start_time, ws.estimated_1rm, ws.weight, ws.reps
    from public.workout_sets ws
    join public.workout_sessions s on s.id = ws.session_id
   where ws.exercise_id = p_exercise_id
     and ws.user_id = (select auth.uid())
     and ws.is_completed
     and ws.estimated_1rm is not null
     and s.end_time is not null
     and s.start_time >= p_since
   order by s.id, ws.estimated_1rm desc, ws.weight desc
$$;

-- Every hard set since a point in time, with the muscles it trained.
-- Feeds the recovery heatmap.
create or replace function public.get_muscle_sets(p_since timestamptz)
returns table (
  completed_at      timestamptz,
  set_type          public.set_type,
  primary_muscle    public.muscle_group,
  secondary_muscles public.muscle_group[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(ws.completed_at, s.start_time), ws.set_type, e.primary_muscle, e.secondary_muscles
    from public.workout_sets ws
    join public.workout_sessions s on s.id = ws.session_id
    join public.exercises e on e.id = ws.exercise_id
   where ws.user_id = (select auth.uid())
     and ws.is_completed
     and ws.set_type <> 'warmup'
     and coalesce(ws.completed_at, s.start_time) >= p_since;
$$;

grant execute on function public.get_logged_exercises() to authenticated;
grant execute on function public.get_e1rm_history(uuid, timestamptz) to authenticated;
grant execute on function public.get_muscle_sets(timestamptz) to authenticated;
