-- Progress insights:
--  * lift goals get an optional date (for the countdown) and the best you
--    had when you set them (so the progress bar starts from there)
--  * weekly_recaps: one recap per week, written by the weekly-recap function
--  * ai_usage gets a kind for recaps so they have their own daily limit

alter table public.exercise_prefs
  add column if not exists goal_date     date,
  add column if not exists goal_start_kg numeric(7,3) check (goal_start_kg is null or goal_start_kg >= 0);

create table if not exists public.weekly_recaps (
  user_id     uuid not null default auth.uid() references public.users (id) on delete cascade,
  -- Monday of the week, in your time zone.
  week_start  date not null,
  recap       jsonb not null,
  source      text not null check (source in ('ai', 'rules')),
  created_at  timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.weekly_recaps enable row level security;
drop policy if exists "weekly_recaps: read own" on public.weekly_recaps;
create policy "weekly_recaps: read own" on public.weekly_recaps
  for select to authenticated using (user_id = (select auth.uid()));
-- Written only by the Edge Function (service role).
revoke all on public.weekly_recaps from anon;
revoke insert, update, delete on public.weekly_recaps from authenticated;
grant select on public.weekly_recaps to authenticated;

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage
  add constraint ai_usage_kind_check check (kind in ('generate_plan', 'adjust_session', 'import_workout', 'weekly_recap'));
