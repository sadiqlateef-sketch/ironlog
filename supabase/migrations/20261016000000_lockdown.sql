-- Security lockdown (audit item A4)
--
-- The app's public key ships inside the APK, so anyone holding the APK can call
-- the database API directly. Every table already had Row Level Security, and
-- the Edge Functions already check the caller's sign-in. This tightens the
-- remaining gaps so access is deny-by-default:
--
--  1. Signed-out callers (the "anon" role) get nothing: no table, sequence or
--     function access, now or for anything added later. Before this, tables and
--     functions added after the first migration picked up Supabase's default
--     grants to anon (RLS still returned no rows, but nothing should be reachable).
--  2. Policies that applied to every role now apply to signed-in users only.
--  3. Rows can only point at things you own: a workout can't be filed under
--     someone else's routine, a routine under someone else's program, a set or
--     plan under someone else's custom exercise, and so on.

-- -----------------------------------------------------------------------------
-- 1. Nothing for signed-out callers
-- -----------------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

-- Same rules for whatever later migrations create.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;

-- Server-only tables stay closed to signed-in users too (re-stated so the
-- default grants above can never reopen them).
revoke all on public.watch_pairings, public.watch_pair_attempts, public.calendar_connections from authenticated;
revoke insert, update on public.ai_usage from authenticated;
revoke all on public.claude_links from authenticated;
grant select (user_id, created_at, last_used_at), delete on public.claude_links to authenticated;
revoke execute on function public.create_claude_link() from public, anon;

-- -----------------------------------------------------------------------------
-- 2 + 3. Policies: signed-in only, and every reference must be yours
-- -----------------------------------------------------------------------------

-- An exercise you may use: the built-in library or one you made.
create or replace function public.can_use_exercise(p_exercise_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.exercises e
     where e.id = p_exercise_id
       and (e.created_by is null or e.created_by = (select auth.uid()))
  );
$$;
revoke execute on function public.can_use_exercise(uuid) from public, anon;
grant execute on function public.can_use_exercise(uuid) to authenticated, service_role;

-- exercise_prefs and body_measurements had no "to authenticated".
drop policy if exists "exercise_prefs: own rows" on public.exercise_prefs;
create policy "exercise_prefs: own rows" on public.exercise_prefs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_use_exercise(exercise_id));
grant select, insert, update, delete on public.exercise_prefs to authenticated;

drop policy if exists "body_measurements: own rows" on public.body_measurements;
create policy "body_measurements: own rows" on public.body_measurements
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.body_measurements to authenticated;

-- routines: a program workout must be in one of your programs.
drop policy if exists "routines: all own" on public.routines;
create policy "routines: all own" on public.routines
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (program_id is null or exists (select 1 from public.programs p
                                        where p.id = program_id and p.user_id = (select auth.uid())))
  );

-- routine_exercises: your routine, and an exercise you can use.
drop policy if exists "routine_exercises: all via own routine" on public.routine_exercises;
create policy "routine_exercises: all via own routine" on public.routine_exercises
  for all to authenticated
  using (exists (select 1 from public.routines r
                  where r.id = routine_id and r.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.routines r
             where r.id = routine_id and r.user_id = (select auth.uid()))
    and public.can_use_exercise(exercise_id)
  );

-- workout_sessions: started from one of your routines, if any.
drop policy if exists "workout_sessions: all own" on public.workout_sessions;
create policy "workout_sessions: all own" on public.workout_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (routine_id is null or exists (select 1 from public.routines r
                                        where r.id = routine_id and r.user_id = (select auth.uid())))
  );

-- workout_sets: your session, and an exercise you can use.
drop policy if exists "workout_sets: all own" on public.workout_sets;
create policy "workout_sets: all own" on public.workout_sets
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.user_id = (select auth.uid()))
    and public.can_use_exercise(exercise_id)
  );

-- routine_adjustments: your session and your routine's exercise.
drop policy if exists "routine_adjustments: all own" on public.routine_adjustments;
create policy "routine_adjustments: all own" on public.routine_adjustments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.workout_sessions s
                 where s.id = session_id and s.user_id = (select auth.uid()))
    and exists (select 1 from public.routine_exercises re
                  join public.routines r on r.id = re.routine_id
                 where re.id = routine_exercise_id and r.user_id = (select auth.uid()))
  );
