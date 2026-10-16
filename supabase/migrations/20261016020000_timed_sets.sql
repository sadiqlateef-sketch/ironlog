-- Timed and cardio sets
--
-- Sets were weight x reps only, so a plank or a run couldn't be logged as
-- what it is. Now:
--  * exercises.tracking says what a set records:
--      weight_reps    (default) weight and reps
--      time           how long (plank, wall sit, dead hang...), with optional added weight
--      distance_time  how far and how long (run, row, bike...); pace is worked out from them
--  * workout_sets.duration_seconds and distance_m hold the new numbers.
--  * Cardio machines and timed holds are added to the built-in library.
--  * Cardio doesn't count toward the muscle recovery map.

alter table public.exercises
  add column if not exists tracking text not null default 'weight_reps'
    check (tracking in ('weight_reps', 'time', 'distance_time'));

alter table public.workout_sets
  add column if not exists duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  add column if not exists distance_m numeric(9,2) check (distance_m is null or distance_m between 0 and 1000000);

update public.exercises set tracking = 'time'
 where created_by is null and slug in ('plank', 'push-up-to-side-plank');

insert into public.exercises (name, slug, primary_muscle, secondary_muscles, equipment, mechanic, tracking, aliases, instructions) values
  ('Treadmill Run', 'treadmill-run', 'quads', '{hamstrings,calves,glutes}', 'machine', 'compound', 'distance_time', '{"Treadmill","Running","Treadmill Jog"}'::text[], 'Run or jog on the treadmill. Log the distance and time from the display.'),
  ('Outdoor Run', 'outdoor-run', 'quads', '{hamstrings,calves,glutes}', 'bodyweight', 'compound', 'distance_time', '{"Run","Jog","Running"}'::text[], 'Run or jog outside. Log the distance and time.'),
  ('Walk', 'walk', 'calves', '{quads,glutes}', 'bodyweight', 'compound', 'distance_time', '{"Walking","Incline Walk"}'::text[], 'Walk at a brisk pace. Log the distance and time.'),
  ('Rowing Machine', 'rowing-machine', 'upper_back', '{lats,quads,hamstrings}', 'machine', 'compound', 'distance_time', '{"Rower","Row Erg","Erg","Concept2"}'::text[], 'Drive with the legs, then lean back slightly and pull the handle to your lower ribs. Log the distance and time from the monitor.'),
  ('Stationary Bike', 'stationary-bike', 'quads', '{hamstrings,calves}', 'machine', 'compound', 'distance_time', '{"Bike","Exercise Bike","Spin Bike","Cycling"}'::text[], 'Pedal at a steady effort. Log the distance and time from the display.'),
  ('Elliptical', 'elliptical', 'quads', '{glutes,hamstrings}', 'machine', 'compound', 'distance_time', '{"Cross Trainer","Elliptical Trainer"}'::text[], 'Stride smoothly, pushing and pulling the handles. Log the distance and time.'),
  ('Stair Climber', 'stair-climber', 'glutes', '{quads,calves}', 'machine', 'compound', 'time', '{"StairMaster","Stair Stepper","Step Mill"}'::text[], 'Climb at a steady pace without leaning on the rails. Log the time.'),
  ('Jump Rope', 'jump-rope', 'calves', '{quads}', 'other', 'compound', 'time', '{"Skipping","Skipping Rope","Rope Jumping"}'::text[], 'Jump just high enough to clear the rope, landing softly on the balls of your feet. Log the time.'),
  ('Battle Ropes', 'battle-ropes', 'front_delts', '{abs,forearms}', 'other', 'compound', 'time', '{"Battle Rope Waves"}'::text[], 'Hold one rope end in each hand and make fast alternating waves. Log the time.'),
  ('Side Plank', 'side-plank', 'obliques', '{abs}', 'bodyweight', 'isolation', 'time', '{"Side Bridge"}'::text[], 'Lie on your side and lift your hips so your body is straight from head to feet, resting on one forearm. Hold, then switch sides.'),
  ('Wall Sit', 'wall-sit', 'quads', '{glutes}', 'bodyweight', 'isolation', 'time', '{"Wall Squat"}'::text[], 'Lean your back on a wall and slide down until your thighs are level with the floor. Hold.'),
  ('Dead Hang', 'dead-hang', 'forearms', '{lats}', 'bodyweight', 'isolation', 'time', '{"Bar Hang"}'::text[], 'Hang from a pull-up bar with straight arms and relaxed shoulders. Hold.')
on conflict (slug) where created_by is null do update set tracking = excluded.tracking;

-- "Last time" now includes time and distance (the return type changes, so recreate it).
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
  distance_m       numeric
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
  select ws.session_id, ls.start_time, ws.set_number, ws.set_type, ws.weight, ws.reps, ws.rpe, ws.duration_seconds, ws.distance_m
    from public.workout_sets ws
    join last_session ls on ls.session_id = ws.session_id
   where ws.exercise_id = p_exercise_id
     and ws.is_completed
   order by ws.exercise_order, ws.set_number;
$$;
revoke execute on function public.get_last_performance(uuid) from public, anon;
grant execute on function public.get_last_performance(uuid) to authenticated, service_role;

-- Recovery map: strength work only.
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
     and e.tracking <> 'distance_time'
     and coalesce(ws.completed_at, s.start_time) >= p_since;
$$;
