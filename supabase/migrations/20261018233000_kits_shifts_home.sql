-- Equipment kits, work shifts and "Use What You Got" home workouts.
--  * users.equipment_kits: what each place you train has (your gym, your
--    home set): equipment types, bench / rack / pull-up bar, the bar, plates
--    and dumbbells with how many of each, and exercises it doesn't have.
--    Plans, swaps, the plate calculator and home workouts use it. Kept on the
--    profile so it works offline like the rest of your settings.
--  * users.active_kit_id: the kit in use right now.
--  * users.work_shifts: your nursing shifts ({ date, type, start, end }), so
--    the week plan keeps heavy days away from shifts and post-night days.
--  * workout_sessions.kit_id: which kit a workout was done with.
--  * workout_sessions.add_to_calendar: your "Add to calendar?" answer at the
--    end of a home workout. true = add it even though it wasn't at the gym,
--    false = never add it, null = the usual gym rule (at the gym, over 30 min).

alter table public.users
  add column if not exists equipment_kits jsonb not null default '[]'::jsonb
    check (jsonb_typeof(equipment_kits) = 'array' and jsonb_array_length(equipment_kits) <= 12 and pg_column_size(equipment_kits) < 65536),
  add column if not exists active_kit_id text check (active_kit_id is null or length(active_kit_id) <= 40),
  add column if not exists work_shifts jsonb not null default '[]'::jsonb
    check (jsonb_typeof(work_shifts) = 'array' and jsonb_array_length(work_shifts) <= 400);

alter table public.workout_sessions
  add column if not exists kit_id text check (kit_id is null or length(kit_id) <= 40),
  add column if not exists add_to_calendar boolean;
