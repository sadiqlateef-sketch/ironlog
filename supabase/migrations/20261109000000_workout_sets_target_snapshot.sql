-- Target preservation on completed sets (wger take #2)
-- Adds nullable snapshot columns to workout_sets so sets retain their original
-- prescribed targets from the routine even if the routine is subsequently updated.

alter table public.workout_sets
  add column if not exists target_reps   smallint check (target_reps is null or target_reps between 1 and 1000),
  add column if not exists target_weight numeric(7,3) check (target_weight is null or target_weight >= 0),
  add column if not exists target_rpe    numeric(3,1) check (target_rpe is null or target_rpe between 1 and 10);
