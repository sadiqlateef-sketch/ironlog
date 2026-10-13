-- =============================================================================
-- Phase 6: link a Wear OS watch to an account without typing a password on it.
--
--   1. The watch asks for a pairing: it gets a 6-digit code to show, plus a
--      secret only it knows (we store just a hash of the secret).
--   2. The signed-in phone/web app enters the code, which "claims" it.
--   3. The watch polls with its secret; once claimed, the server hands it a
--      one-time sign-in token. Each pairing can be used once and expires in 10 min.
--
-- Only the watch-pair Edge Function (service role) touches these tables:
-- RLS is on with no policies, so the app's own users can't read them.
-- =============================================================================

create table public.watch_pairings (
  id           uuid primary key default gen_random_uuid(),
  code         text not null check (code ~ '^[0-9]{6}$'),
  secret_hash  text not null,
  user_id      uuid references public.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '10 minutes',
  claimed_at   timestamptz,
  consumed_at  timestamptz
);

-- A code can only be live once at a time.
create unique index watch_pairings_live_code_idx on public.watch_pairings (code) where consumed_at is null;
create index watch_pairings_expires_idx on public.watch_pairings (expires_at);

-- Failed code entries, to stop someone guessing codes.
create table public.watch_pair_attempts (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index watch_pair_attempts_user_idx on public.watch_pair_attempts (user_id, created_at);

alter table public.watch_pairings      enable row level security;
alter table public.watch_pair_attempts enable row level security;
revoke all on public.watch_pairings, public.watch_pair_attempts from anon, authenticated;

-- =============================================================================
-- Heart-rate summary: keep workout_sessions.avg_hr / max_hr up to date as the
-- watch uploads samples (it sends them in small batches during the workout).
-- =============================================================================
create or replace function public.refresh_session_hr()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.workout_sessions s
     set avg_hr = agg.avg_bpm, max_hr = agg.max_bpm
    from (
      select h.session_id, round(avg(h.bpm))::smallint as avg_bpm, max(h.bpm) as max_bpm
        from public.heart_rate_samples h
       where h.session_id in (select distinct session_id from new_rows)
       group by h.session_id
    ) agg
   where s.id = agg.session_id;
  return null;
end;
$$;

create trigger heart_rate_samples_summary
  after insert on public.heart_rate_samples
  referencing new table as new_rows
  for each statement execute function public.refresh_session_hr();
