-- Bring history in from JEFIT (or Strong, Hevy, a spreadsheet) without
-- doubling up when the same export is imported again.
--  * import_key is a fingerprint of the workout as it appeared in the file
--    (app, day, exercises and sets), set only on workouts imported from a file.
--  * One per user: re-importing the same workout is skipped, not duplicated.

alter table public.workout_sessions add column if not exists import_key text
  check (import_key is null or char_length(import_key) <= 120);

create unique index if not exists workout_sessions_import_key
  on public.workout_sessions (user_id, import_key)
  where import_key is not null;
