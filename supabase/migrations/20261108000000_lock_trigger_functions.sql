-- Two trigger functions run with owner rights (SECURITY DEFINER) and, like
-- every new function, could also be called directly through the API
-- (/rest/v1/rpc/...). They're only meant to fire as triggers, so take away
-- the direct call. Triggers still fire: Postgres doesn't check EXECUTE when a
-- trigger runs. (Supabase security advisor, 2026-11-07.)
--
-- create_claude_link() stays callable by signed-in users on purpose: the app
-- calls it to make a Claude connector token for your own account.

revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.refresh_session_volume() from public, anon, authenticated;
