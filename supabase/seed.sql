-- Starter exercise library (built-in, so created_by is null).
-- animation_url stays null for now; Phase 2 shows a placeholder.
insert into public.exercises (name, slug, primary_muscle, secondary_muscles, equipment, mechanic) values
  -- Big compound barbell lifts
  ('Back Squat',               'back-squat',               'quads',      '{glutes,adductors,lower_back}',      'barbell',  'compound'),
  ('Front Squat',              'front-squat',              'quads',      '{glutes,abs,upper_back}',            'barbell',  'compound'),
  ('Conventional Deadlift',    'conventional-deadlift',    'hamstrings', '{glutes,lower_back,traps,forearms}', 'barbell',  'compound'),
  ('Sumo Deadlift',            'sumo-deadlift',            'glutes',     '{quads,adductors,hamstrings,lower_back}', 'barbell', 'compound'),
  ('Romanian Deadlift',        'romanian-deadlift',        'hamstrings', '{glutes,lower_back}',                'barbell',  'compound'),
  ('Bench Press',              'bench-press',              'chest',      '{triceps,front_delts}',              'barbell',  'compound'),
  ('Close-Grip Bench Press',   'close-grip-bench-press',   'triceps',    '{chest,front_delts}',                'barbell',  'compound'),
  ('Incline Bench Press',      'incline-bench-press',      'chest',      '{front_delts,triceps}',              'barbell',  'compound'),
  ('Overhead Press',           'overhead-press',           'front_delts','{side_delts,triceps,upper_back}',    'barbell',  'compound'),
  ('Barbell Row',              'barbell-row',              'upper_back', '{lats,biceps,rear_delts,lower_back}','barbell',  'compound'),
  ('Pendlay Row',              'pendlay-row',              'upper_back', '{lats,biceps,rear_delts}',           'barbell',  'compound'),
  ('Hip Thrust',               'hip-thrust',               'glutes',     '{hamstrings}',                       'barbell',  'compound'),
  ('Trap Bar Deadlift',        'trap-bar-deadlift',        'quads',      '{glutes,hamstrings,traps}',          'trap_bar', 'compound'),
  -- Bodyweight compounds
  ('Pull-Up',                  'pull-up',                  'lats',       '{biceps,upper_back}',                'bodyweight','compound'),
  ('Chin-Up',                  'chin-up',                  'lats',       '{biceps}',                           'bodyweight','compound'),
  ('Dip',                      'dip',                      'chest',      '{triceps,front_delts}',              'bodyweight','compound'),
  -- Dumbbell / machine / cable accessories
  ('Dumbbell Bench Press',     'dumbbell-bench-press',     'chest',      '{triceps,front_delts}',              'dumbbell', 'compound'),
  ('Dumbbell Row',             'dumbbell-row',             'lats',       '{upper_back,biceps}',                'dumbbell', 'compound'),
  ('Bulgarian Split Squat',    'bulgarian-split-squat',    'quads',      '{glutes,adductors}',                 'dumbbell', 'compound'),
  ('Lat Pulldown',             'lat-pulldown',             'lats',       '{biceps,upper_back}',                'cable',    'compound'),
  ('Seated Cable Row',         'seated-cable-row',         'upper_back', '{lats,biceps,rear_delts}',           'cable',    'compound'),
  ('Leg Press',                'leg-press',                'quads',      '{glutes}',                           'machine',  'compound'),
  ('Lateral Raise',            'lateral-raise',            'side_delts', '{}',                                 'dumbbell', 'isolation'),
  ('Face Pull',                'face-pull',                'rear_delts', '{upper_back,traps}',                 'cable',    'isolation'),
  ('Barbell Curl',             'barbell-curl',             'biceps',     '{forearms}',                         'barbell',  'isolation'),
  ('Triceps Pushdown',         'triceps-pushdown',         'triceps',    '{}',                                 'cable',    'isolation'),
  ('Leg Curl',                 'leg-curl',                 'hamstrings', '{}',                                 'machine',  'isolation'),
  ('Leg Extension',            'leg-extension',            'quads',      '{}',                                 'machine',  'isolation'),
  ('Standing Calf Raise',      'standing-calf-raise',      'calves',     '{}',                                 'machine',  'isolation'),
  ('Hanging Leg Raise',        'hanging-leg-raise',        'abs',        '{obliques}',                         'bodyweight','isolation')
on conflict do nothing;
