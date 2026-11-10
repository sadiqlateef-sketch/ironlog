-- Structured exercise variation grouping (wger take #3)
-- Adds nullable variation_group column to exercises table and populates it
-- deterministically from existing exercise metadata (name, primary_muscle, aliases).

alter table public.exercises
  add column if not exists variation_group text;

create index if not exists exercises_variation_group_idx
  on public.exercises (variation_group)
  where variation_group is not null;

-- Deterministic assignment rule based on canonical base movements
update public.exercises
set variation_group = case
  -- Bench press variants (chest)
  when primary_muscle = 'chest' and (name ~* '\y(bench press|chest press)\y' or 'Bench Press' = any(aliases)) then 'bench-press'
  -- Squat variants (quads)
  when primary_muscle = 'quads' and (name ~* '\ysquat\y' or 'Squat' = any(aliases)) then 'squat'
  -- Deadlift variants
  when name ~* '\ydeadlift\y' or 'Deadlift' = any(aliases) then 'deadlift'
  -- Overhead press variants (shoulders)
  when primary_muscle = 'shoulders' and (name ~* '\y(overhead press|shoulder press|military press)\y' or 'Overhead Press' = any(aliases)) then 'overhead-press'
  -- Row variants (upper back / lats)
  when (primary_muscle = 'upper_back' or primary_muscle = 'lats') and (name ~* '\y(bent[ -]over row|barbell row|dumbbell row|cable row|t-bar row|pendlay row|seated row|inverted row|row)\y' or 'Row' = any(aliases)) then 'row'
  -- Pull-up / chin-up variants (lats)
  when primary_muscle = 'lats' and (name ~* '\y(pull[ -]?up|chin[ -]?up|lat pull[ -]?down)\y' or 'Pull-Up' = any(aliases)) then 'pull-up'
  -- Dip variants
  when name ~* '\ydips?\y' or 'Dip' = any(aliases) then 'dip'
  -- Lunge variants (quads / glutes)
  when (primary_muscle = 'quads' or primary_muscle = 'glutes') and (name ~* '\ylunges?\y' or 'Lunge' = any(aliases)) then 'lunge'
  -- Hip thrust / glute bridge variants (glutes)
  when primary_muscle = 'glutes' and (name ~* '\y(hip thrust|glute bridge)\y' or 'Hip Thrust' = any(aliases)) then 'hip-thrust'
  -- Bicep curl variants (biceps)
  when primary_muscle = 'biceps' and (name ~* '\y(biceps? curl|hammer curl|preacher curl|concentration curl|curl)\y' or 'Bicep Curl' = any(aliases)) then 'biceps-curl'
  -- Triceps extension / pushdown variants (triceps)
  when primary_muscle = 'triceps' and (name ~* '\y(triceps? extension|pushdown|skull[ -]?crusher|kickback)\y' or 'Triceps Pushdown' = any(aliases)) then 'triceps-extension'
  -- Lateral raise variants (shoulders)
  when primary_muscle = 'shoulders' and (name ~* '\y(lateral raise|side raise)\y' or 'Lateral Raise' = any(aliases)) then 'lateral-raise'
  -- Chest fly variants (chest)
  when primary_muscle = 'chest' and (name ~* '\y(chest fly|pec fly|cable fly|dumbbell fly|flyes?)\y' or 'Chest Fly' = any(aliases)) then 'chest-fly'
  -- Calf raise variants (calves)
  when primary_muscle = 'calves' and (name ~* '\ycalf raise\y' or 'Calf Raise' = any(aliases)) then 'calf-raise'
  -- Leg curl variants (hamstrings)
  when primary_muscle = 'hamstrings' and (name ~* '\yleg curl\y' or 'Leg Curl' = any(aliases)) then 'leg-curl'
  -- Leg extension variants (quads)
  when primary_muscle = 'quads' and (name ~* '\yleg extension\y' or 'Leg Extension' = any(aliases)) then 'leg-extension'
  else null
end;
