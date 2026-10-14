-- Gym check-in: you pick your gym's spot on the map, the app checks whether
-- you're there when a workout starts, and workouts at the gym that run longer
-- than 30 minutes are added to a Google Calendar you choose.
--  * users.gym_* is where your gym is (set from "Use where I am now")
--  * workout_sessions.at_gym: null = not checked yet, true/false = checked
--  * workout_sessions.calendar_event_id: set once the event is on your calendar
--  * calendar_connections holds the Google sign-in. Only the gym-calendar Edge
--    Function (service role) can read it: RLS is on with no policies, so the
--    refresh token never reaches the app.

alter table public.users
  add column if not exists gym_name     text,
  add column if not exists gym_lat      double precision check (gym_lat between -90 and 90),
  add column if not exists gym_lng      double precision check (gym_lng between -180 and 180),
  add column if not exists gym_radius_m integer not null default 200 check (gym_radius_m between 50 and 2000);

alter table public.workout_sessions
  add column if not exists at_gym            boolean,
  add column if not exists calendar_event_id text;

create table if not exists public.calendar_connections (
  user_id        uuid primary key references public.users (id) on delete cascade,
  google_email   text,
  refresh_token  text not null,
  calendar_id    text,
  calendar_name  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists calendar_connections_updated_at on public.calendar_connections;
create trigger calendar_connections_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated;
