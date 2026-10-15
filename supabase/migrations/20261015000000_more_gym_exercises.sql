-- More gym exercises and the names people actually use for them
--  * Butterfly is now called "Machine Fly" (Butterfly and Pec Deck stay as aliases).
--  * Common gym names added as aliases to machine, cable and dumbbell exercises
--    already in the library, so search, the importer and the Claude connector
--    find them ("pec deck", "rope pushdown", "hip abduction machine"...).
--  * ~40 machine, cable and plate-loaded exercises that free-exercise-db lacks.
--    These have no photos yet; the app shows its placeholder.

update public.exercises set name = 'Machine Fly'
where slug = 'butterfly' and created_by is null;

-- Append aliases, keeping existing ones first and dropping duplicates.
update public.exercises e
set aliases = array(
  select a from unnest(e.aliases || v.extra) with ordinality as u(a, i)
  group by a order by min(i)
)
from (values
  ('butterfly', '{"Butterfly","Pec Deck","Pec Deck Fly","Pec Fly","Chest Fly Machine","Seated Machine Fly","Machine Chest Fly"}'::text[]),
  ('reverse-machine-flyes', '{"Reverse Pec Deck","Rear Delt Machine","Machine Rear Delt Fly","Rear Delt Fly Machine"}'::text[]),
  ('leverage-chest-press', '{"Chest Press Machine","Machine Chest Press","Plate-Loaded Chest Press","Hammer Strength Chest Press"}'::text[]),
  ('machine-bench-press', '{"Seated Chest Press","Selectorized Chest Press"}'::text[]),
  ('leverage-incline-chest-press', '{"Incline Chest Press Machine","Machine Incline Press","Incline Machine Press","Hammer Strength Incline Press"}'::text[]),
  ('leverage-decline-chest-press', '{"Decline Chest Press Machine","Machine Decline Press"}'::text[]),
  ('machine-shoulder-military-press', '{"Shoulder Press Machine","Machine Shoulder Press","Machine Overhead Press"}'::text[]),
  ('leverage-shoulder-press', '{"Plate-Loaded Shoulder Press","Hammer Strength Shoulder Press"}'::text[]),
  ('leverage-iso-row', '{"Machine Row","Iso-Lateral Row","Hammer Strength Row","Plate-Loaded Row"}'::text[]),
  ('leverage-high-row', '{"High Row Machine","Machine High Row","Hammer Strength High Row"}'::text[]),
  ('leverage-shrug', '{"Machine Shrug","Shrug Machine"}'::text[]),
  ('lying-t-bar-row', '{"Chest-Supported T-Bar Row","T-Bar Row Machine"}'::text[]),
  ('t-bar-row-with-handle', '{"T-Bar Row","Landmine Row"}'::text[]),
  ('dip-machine', '{"Seated Dip Machine","Triceps Dip Machine","Machine Dip"}'::text[]),
  ('hack-squat', '{"Machine Hack Squat","Hack Squat Machine"}'::text[]),
  ('leg-press', '{"Seated Leg Press","45 Degree Leg Press","Plate-Loaded Leg Press","Horizontal Leg Press"}'::text[]),
  ('leg-curl', '{"Lying Leg Curl","Prone Leg Curl"}'::text[]),
  ('seated-leg-curl', '{"Seated Hamstring Curl","Machine Seated Leg Curl"}'::text[]),
  ('thigh-abductor', '{"Hip Abduction","Hip Abduction Machine","Abductor Machine","Outer Thigh Machine"}'::text[]),
  ('thigh-adductor', '{"Hip Adduction","Hip Adduction Machine","Adductor Machine","Inner Thigh Machine"}'::text[]),
  ('seated-calf-raise', '{"Seated Calf Raise Machine","Machine Seated Calf Raise"}'::text[]),
  ('calf-press', '{"Calf Press Machine"}'::text[]),
  ('calf-press-on-the-leg-press-machine', '{"Leg Press Calf Raise","Calf Raise on Leg Press"}'::text[]),
  ('standing-calf-raise', '{"Standing Calf Raise Machine","Machine Standing Calf Raise"}'::text[]),
  ('machine-bicep-curl', '{"Biceps Curl Machine","Machine Curl","Machine Biceps Curl"}'::text[]),
  ('machine-preacher-curls', '{"Machine Preacher Curl","Preacher Curl Machine"}'::text[]),
  ('machine-triceps-extension', '{"Triceps Extension Machine","Tricep Extension Machine"}'::text[]),
  ('ab-crunch-machine', '{"Machine Crunch","Abdominal Crunch Machine","Machine Ab Crunch"}'::text[]),
  ('cable-crossover', '{"Cable Fly","Cable Chest Fly","Standing Cable Fly","High to Low Cable Fly"}'::text[]),
  ('low-cable-crossover', '{"Low to High Cable Fly","Low Cable Fly"}'::text[]),
  ('flat-bench-cable-flyes', '{"Bench Cable Fly","Lying Cable Fly"}'::text[]),
  ('standing-biceps-cable-curl', '{"Cable Curl","Cable Bicep Curl","Cable Biceps Curl","Straight Bar Cable Curl"}'::text[]),
  ('triceps-pushdown', '{"Tricep Pushdown","Straight Bar Pushdown","Cable Tricep Pushdown"}'::text[]),
  ('triceps-pushdown-rope-attachment', '{"Rope Pushdown","Tricep Rope Pushdown","Rope Triceps Pushdown","Cable Rope Pushdown"}'::text[]),
  ('triceps-pushdown-v-bar-attachment', '{"V-Bar Pushdown","V Bar Tricep Pushdown"}'::text[]),
  ('reverse-grip-triceps-pushdown', '{"Reverse Grip Pushdown","Underhand Tricep Pushdown"}'::text[]),
  ('cable-rope-overhead-triceps-extension', '{"Overhead Cable Tricep Extension","Rope Overhead Extension","Cable Overhead Triceps Extension"}'::text[]),
  ('cable-rear-delt-fly', '{"Reverse Cable Fly","Cable Reverse Fly"}'::text[]),
  ('standing-low-pulley-deltoid-raise', '{"Cable Lateral Raise","Single Arm Cable Lateral Raise","One Arm Cable Lateral Raise"}'::text[]),
  ('front-cable-raise', '{"Cable Front Raise"}'::text[]),
  ('upright-cable-row', '{"Cable Upright Row"}'::text[]),
  ('cable-shrugs', '{"Cable Shrug"}'::text[]),
  ('one-legged-cable-kickback', '{"Cable Glute Kickback","Single Leg Cable Kickback"}'::text[]),
  ('pull-through', '{"Cable Pull-Through","Cable Pull Through"}'::text[]),
  ('cable-crunch', '{"Kneeling Cable Crunch","Rope Cable Crunch"}'::text[]),
  ('straight-arm-pulldown', '{"Cable Pullover","Straight Arm Lat Pulldown","Lat Prayer"}'::text[]),
  ('rope-straight-arm-pulldown', '{"Rope Pullover","Rope Lat Pullover"}'::text[]),
  ('close-grip-front-lat-pulldown', '{"Close Grip Lat Pulldown","Close-Grip Pulldown"}'::text[]),
  ('underhand-cable-pulldowns', '{"Reverse Grip Lat Pulldown","Underhand Lat Pulldown","Supinated Pulldown"}'::text[]),
  ('v-bar-pulldown', '{"V-Grip Pulldown","Neutral Grip Pulldown"}'::text[]),
  ('one-arm-lat-pulldown', '{"Single Arm Lat Pulldown"}'::text[]),
  ('seated-one-arm-cable-pulley-rows', '{"Seated Single Arm Cable Row","One Arm Seated Cable Row"}'::text[]),
  ('cable-hammer-curls-rope-attachment', '{"Rope Hammer Curl","Cable Rope Curl"}'::text[]),
  ('cable-preacher-curl', '{"Cable Preacher Curl"}'::text[]),
  ('standing-cable-wood-chop', '{"Cable Woodchop","Cable Wood Chop"}'::text[]),
  ('cable-hip-adduction', '{"Cable Adduction"}'::text[]),
  ('smith-machine-hip-raise', '{"Smith Machine Hip Thrust","Smith Machine Glute Bridge"}'::text[]),
  ('dumbbell-incline-row', '{"Chest-Supported Dumbbell Row","Incline Bench Dumbbell Row","Seal Row"}'::text[]),
  ('hyperextensions-back-extensions', '{"Back Extension","45 Degree Back Extension","Roman Chair Back Extension"}'::text[]),
  ('tricep-dumbbell-kickback', '{"Dumbbell Kickback","Triceps Kickback"}'::text[]),
  ('hammer-curls', '{"Hammer Curl","Dumbbell Hammer Curl"}'::text[]),
  ('dumbbell-shoulder-press', '{"Seated Dumbbell Shoulder Press","DB Shoulder Press"}'::text[])
) as v(slug, extra)
where e.slug = v.slug and e.created_by is null;

insert into public.exercises (name, slug, primary_muscle, secondary_muscles, equipment, mechanic, aliases, instructions) values
  ('Incline Machine Fly', 'incline-machine-fly', 'chest', '{"front_delts"}', 'machine', 'isolation', '{"Incline Pec Deck","Incline Chest Fly Machine"}'::text[], 'Sit with your back on the inclined pad and the handles at chest height. Squeeze the handles together in a wide arc until they meet in front of your upper chest, pause, then let them open slowly until you feel a stretch.'),
  ('Machine Incline Chest Press', 'machine-incline-chest-press', 'chest', '{"front_delts","triceps"}', 'machine', 'compound', '{"Selectorized Incline Press","Incline Chest Press"}'::text[], 'Set the seat so the handles line up with your upper chest. Press the handles forward and up until your arms are straight without locking, then lower under control until you feel a stretch across the chest.'),
  ('Seated Cable Fly', 'seated-cable-fly', 'chest', '{"front_delts"}', 'cable', 'isolation', '{"Seated Cable Chest Fly","Bench Cable Crossover"}'::text[], 'Set a bench between two cable stacks with the handles at shoulder height. Sit tall, arms open with a slight bend, and bring the handles together in front of your chest. Pause, then let them return slowly.'),
  ('Single-Arm Cable Fly', 'single-arm-cable-fly', 'chest', '{"front_delts"}', 'cable', 'isolation', '{"One Arm Cable Fly","Unilateral Cable Fly"}'::text[], 'Stand side-on to a cable at shoulder height with the handle in the far hand. Keep a soft elbow and sweep the handle across your body to the midline, squeeze, then return slowly.'),
  ('Plate-Loaded Wide Chest Press', 'plate-loaded-wide-chest-press', 'chest', '{"front_delts","triceps"}', 'machine', 'compound', '{"Wide Chest Press","Hammer Strength Wide Chest"}'::text[], 'Sit with the handles at mid-chest and a wide grip. Press both arms forward until nearly straight, then lower slowly to a deep stretch. Each arm moves on its own, so keep them even.'),
  ('Seated Machine Row', 'seated-machine-row', 'upper_back', '{"lats","biceps","rear_delts"}', 'machine', 'compound', '{"Seated Row Machine","Chest-Supported Machine Row","Selectorized Row"}'::text[], 'Sit with your chest against the pad and grab the handles. Pull your elbows back and squeeze your shoulder blades together, pause, then let your arms extend fully under control.'),
  ('Machine Lat Pulldown', 'machine-lat-pulldown', 'lats', '{"biceps","upper_back"}', 'machine', 'compound', '{"Plate-Loaded Pulldown","Hammer Strength Pulldown","Iso-Lateral Pulldown","Pulldown Machine"}'::text[], 'Lock your thighs under the pads and grab the handles overhead. Drive your elbows down toward your sides until the handles reach your upper chest, then let them rise slowly to a full stretch.'),
  ('Assisted Pull-Up', 'assisted-pull-up', 'lats', '{"biceps","upper_back"}', 'machine', 'compound', '{"Assisted Pull-Up Machine","Assisted Pull Up","Gravitron","Assisted Chin-Up"}'::text[], 'Kneel or stand on the platform and grab the handles. Pull yourself up until your chin clears your hands, then lower slowly. Log the assistance as the weight; more assistance makes it easier.'),
  ('Machine Pullover', 'machine-pullover', 'lats', '{"chest","triceps"}', 'machine', 'isolation', '{"Pullover Machine","Nautilus Pullover"}'::text[], 'Sit with your elbows on the pads and your arms overhead. Drive the elbows down in an arc until the bar reaches your stomach, pause, then let it return slowly to a full stretch.'),
  ('Single-Arm Cable Row', 'single-arm-cable-row', 'lats', '{"upper_back","biceps"}', 'cable', 'compound', '{"One Arm Cable Row","Standing Single Arm Cable Row"}'::text[], 'Hold a cable handle at chest height in one hand. Row your elbow back past your torso and squeeze, then let the arm extend fully with a slight reach forward.'),
  ('Wide-Grip Seated Cable Row', 'wide-grip-seated-cable-row', 'upper_back', '{"rear_delts","lats","biceps"}', 'cable', 'compound', '{"Wide Grip Cable Row","Lat Bar Cable Row"}'::text[], 'Sit at a low cable with a long bar and a wide overhand grip. Row the bar to your lower chest with elbows flared, squeeze your upper back, then extend your arms slowly.'),
  ('Back Extension Machine', 'back-extension-machine', 'lower_back', '{"glutes","hamstrings"}', 'machine', 'isolation', '{"Machine Back Extension","Seated Back Extension","Lower Back Machine"}'::text[], 'Sit with the pad across your upper back and your feet secured. Extend your torso back until you are upright or slightly past, pause, then return slowly.'),
  ('Machine Lateral Raise', 'machine-lateral-raise', 'side_delts', '{}', 'machine', 'isolation', '{"Lateral Raise Machine","Machine Side Raise","Seated Lateral Raise Machine"}'::text[], 'Sit with the pads against the outside of your upper arms. Raise your arms out to the sides up to shoulder height, pause, then lower slowly.'),
  ('Machine Rear Delt Row', 'machine-rear-delt-row', 'rear_delts', '{"upper_back"}', 'machine', 'compound', '{"Rear Delt Row Machine"}'::text[], 'Sit chest-supported with an overhand grip. Row with your elbows high and wide until they pass your torso, squeeze, then extend slowly.'),
  ('Cable Y-Raise', 'cable-y-raise', 'side_delts', '{"traps","rear_delts"}', 'cable', 'isolation', '{"Cable Y Raise","Cross Cable Y Raise"}'::text[], 'Stand between two low cables holding the opposite handles. Raise your arms up and out into a Y shape to just above shoulder height, then lower slowly.'),
  ('Cable Upright Row (Rope)', 'cable-rope-upright-row', 'side_delts', '{"traps"}', 'cable', 'compound', '{"Rope Upright Row"}'::text[], 'Hold a rope on a low cable. Pull the rope up along your body with elbows leading until your hands reach chest height, then lower slowly.'),
  ('Bayesian Cable Curl', 'bayesian-cable-curl', 'biceps', '{}', 'cable', 'isolation', '{"Behind-the-Body Cable Curl","Bayesian Curl"}'::text[], 'Face away from a low cable with the handle in one hand behind you. Keep your elbow back and curl the handle up, squeeze, then lower to a full stretch.'),
  ('Cable Triceps Kickback', 'cable-triceps-kickback', 'triceps', '{}', 'cable', 'isolation', '{"Cable Kickback","Cable Tricep Kickback"}'::text[], 'Hinge forward holding a low cable handle with your upper arm by your side. Straighten your elbow until your arm points back, squeeze, then return slowly.'),
  ('Single-Arm Cable Pushdown', 'single-arm-cable-pushdown', 'triceps', '{}', 'cable', 'isolation', '{"One Arm Tricep Pushdown","Single Arm Pushdown"}'::text[], 'Grab a high cable handle with one hand. Keep your elbow pinned to your side and push down until your arm is straight, then let it rise slowly.'),
  ('Cable Cross-Body Triceps Extension', 'cable-cross-body-triceps-extension', 'triceps', '{}', 'cable', 'isolation', '{"Cross Body Cable Extension","Cable Y Extension"}'::text[], 'Stand between two high cables holding the opposite handles. Extend your arms down and out until straight, then let them return slowly.'),
  ('Machine Wrist Curl', 'machine-wrist-curl', 'forearms', '{}', 'machine', 'isolation', '{"Wrist Curl Machine"}'::text[], 'Rest your forearms on the pad with your hands over the edge. Curl your wrists up, pause, then lower slowly.'),
  ('Pendulum Squat', 'pendulum-squat', 'quads', '{"glutes"}', 'machine', 'compound', '{"Pendulum Squat Machine"}'::text[], 'Stand on the platform with your back on the pad and shoulders under the yokes. Squat down as deep as you can control, then drive back up through the whole foot.'),
  ('Belt Squat', 'belt-squat', 'quads', '{"glutes","adductors"}', 'machine', 'compound', '{"Belt Squat Machine"}'::text[], 'Attach the belt around your hips and stand on the platform. Squat down with an upright torso, then stand back up. Your spine stays unloaded.'),
  ('V-Squat', 'v-squat', 'quads', '{"glutes"}', 'machine', 'compound', '{"V Squat Machine","Power Squat Machine"}'::text[], 'Stand on the platform with your shoulders under the pads. Lower until your thighs are at least parallel, then drive back up.'),
  ('Hip Thrust Machine', 'hip-thrust-machine', 'glutes', '{"hamstrings"}', 'machine', 'compound', '{"Machine Hip Thrust","Glute Drive","Plate-Loaded Hip Thrust"}'::text[], 'Sit with your upper back on the pad and the belt across your hips. Drive your hips up until your body is flat from knees to shoulders, squeeze your glutes, then lower slowly.'),
  ('Glute Kickback Machine', 'glute-kickback-machine', 'glutes', '{"hamstrings"}', 'machine', 'isolation', '{"Machine Glute Kickback","Glute Machine"}'::text[], 'Brace on the pads with one foot on the platform. Push the leg back and up until your hip is fully extended, squeeze, then return slowly.'),
  ('Cable Hip Abduction', 'cable-hip-abduction', 'abductors', '{"glutes"}', 'cable', 'isolation', '{"Standing Cable Abduction","Cable Abduction"}'::text[], 'Attach an ankle strap to a low cable and stand side-on with the strap on your far leg. Lift the leg out to the side, pause, then return slowly.'),
  ('Single-Leg Leg Press', 'single-leg-leg-press', 'quads', '{"glutes","hamstrings"}', 'machine', 'compound', '{"One Leg Leg Press","Unilateral Leg Press"}'::text[], 'Sit in the leg press with one foot centred on the platform. Lower until your knee is bent about 90 degrees, then press back up without locking the knee.'),
  ('Rotary Torso Machine', 'rotary-torso-machine', 'obliques', '{"abs"}', 'machine', 'isolation', '{"Torso Rotation Machine","Rotary Torso","Oblique Machine"}'::text[], 'Sit with your chest against the pad and your legs locked in. Rotate your torso to one side against the resistance, then return slowly. Do both sides.'),
  ('Captain''s Chair Leg Raise', 'captains-chair-leg-raise', 'abs', '{"obliques"}', 'other', 'isolation', '{"Captains Chair","Vertical Knee Raise","Roman Chair Leg Raise"}'::text[], 'Support yourself on the forearm pads with your back against the pad. Raise your knees or straight legs up toward your chest, then lower slowly without swinging.'),
  ('Farmer''s Carry', 'farmers-carry', 'forearms', '{"traps","abs"}', 'dumbbell', 'compound', '{"Farmers Walk","Farmer Walk","Farmer''s Walk"}'::text[], 'Pick up a heavy dumbbell or handle in each hand. Stand tall and walk with short, quick steps for the set distance or time. Log the weight in one hand.'),
  ('Landmine Press', 'landmine-press', 'front_delts', '{"chest","triceps"}', 'barbell', 'compound', '{"Single Arm Landmine Press","Landmine Shoulder Press"}'::text[], 'Hold the end of a barbell anchored in a landmine at shoulder height. Press it up and forward until your arm is straight, then lower slowly.'),
  ('Meadows Row', 'meadows-row', 'lats', '{"upper_back","biceps"}', 'barbell', 'compound', '{"Landmine Single Arm Row"}'::text[], 'Stand side-on to a landmine barbell, hinge over and grab the end of the bar with an overhand grip. Row it up toward your hip, then lower to a full stretch.')

on conflict (slug) where created_by is null do update set
  aliases      = excluded.aliases,
  instructions = coalesce(public.exercises.instructions, excluded.instructions);
