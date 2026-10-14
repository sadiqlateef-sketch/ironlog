-- Import a finished workout from a screenshot, a photo of handwritten notes,
-- or pasted text (the import-workout Edge Function reads it with Claude).
--  * imported sessions are tagged source = 'import'
--  * ai_usage gets a new kind so imports have their own daily limit

alter type public.session_source add value if not exists 'import';

alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage
  add constraint ai_usage_kind_check check (kind in ('generate_plan', 'adjust_session', 'import_workout'));
