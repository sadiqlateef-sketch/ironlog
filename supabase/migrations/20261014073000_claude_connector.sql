-- Log workouts from a Claude chat (claude.ai, the Claude app, Claude Code).
--
-- The app makes you a private connector link with a long random secret in it.
-- You paste that link into Claude as a custom connector; the claude-connector
-- Edge Function checks the secret and saves workouts to your account.
--
--  * claude_links: at most one link per person. Only a SHA-256 hash of the
--    secret is stored, so the link can't be read back out of the database;
--    making a new link replaces the old one, deleting it turns Claude off.
--  * sessions saved this way are tagged source = 'claude'.

alter type public.session_source add value if not exists 'claude';

create table public.claude_links (
  user_id      uuid primary key references public.users (id) on delete cascade,
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.claude_links enable row level security;

-- You can see whether you have a link (and when Claude last used it) and
-- delete it. Making one goes through create_claude_link() below.
revoke all on public.claude_links from anon, authenticated;
grant select (user_id, created_at, last_used_at), delete on public.claude_links to authenticated;

create policy "claude_links: read own" on public.claude_links
  for select to authenticated using (user_id = (select auth.uid()));
create policy "claude_links: delete own" on public.claude_links
  for delete to authenticated using (user_id = (select auth.uid()));

-- Make (or replace) your link's secret. Returns the secret once; it isn't
-- stored anywhere in readable form.
create or replace function public.create_claude_link()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid   uuid := auth.uid();
  token text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  -- Two random UUIDs: 244 random bits, written as 64 hex characters.
  token := 'il_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.claude_links (user_id, token_hash)
  values (uid, encode(sha256(convert_to(token, 'UTF8')), 'hex'))
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_used_at = null;
  return token;
end;
$$;

revoke all on function public.create_claude_link() from public, anon;
grant execute on function public.create_claude_link() to authenticated;
