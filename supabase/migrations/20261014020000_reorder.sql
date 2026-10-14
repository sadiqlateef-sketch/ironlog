-- Drag-to-reorder for exercises in a workout and days in a program week.
--
-- Both orders live in unique columns (routine_exercises.position and
-- routines.program_day). Making those constraints deferrable lets one
-- statement shuffle every row and have uniqueness checked at the end.
-- security invoker: Row Level Security still decides which rows you can touch.

alter table public.routine_exercises
  drop constraint routine_exercises_routine_id_position_key,
  add constraint routine_exercises_routine_id_position_key
    unique (routine_id, position) deferrable initially immediate;

alter table public.routines
  drop constraint routines_program_slot_unique,
  add constraint routines_program_slot_unique
    unique (program_id, program_week, program_day) deferrable initially immediate;

-- p_ids: every exercise in the workout, in the new order.
create or replace function public.reorder_routine_exercises(p_routine_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set constraints public.routine_exercises_routine_id_position_key deferred;
  update public.routine_exercises r
     set position = o.n
    from unnest(p_ids) with ordinality as o(id, n)
   where r.id = o.id and r.routine_id = p_routine_id;
end;
$$;

-- p_routine_ids: every workout in that week, in the new day order.
create or replace function public.reorder_program_days(p_program_id uuid, p_week integer, p_routine_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  set constraints public.routines_program_slot_unique deferred;
  update public.routines r
     set program_day = o.n
    from unnest(p_routine_ids) with ordinality as o(id, n)
   where r.id = o.id and r.program_id = p_program_id and r.program_week = p_week;
end;
$$;

grant execute on function public.reorder_routine_exercises(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_program_days(uuid, integer, uuid[]) to authenticated;
