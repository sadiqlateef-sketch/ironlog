-- AMRAP sets ("as many reps as possible") and an optional tempo for routine exercises, e.g. 3-1-1-0.
alter type public.set_type add value if not exists 'amrap';

alter table public.routine_exercises
  add column if not exists tempo text check (tempo is null or tempo ~ '^[0-9X]-[0-9X]-[0-9X]-[0-9X]$');
