-- Form demos for exercises that had no photos
--  * exercises.demo_note: a short caption under the demo.
--  * Machine and cable exercises added in 20261015000000 had no photos. Where
--    free-exercise-db has the same movement on other equipment, borrow its
--    start/end photos and say so in demo_note. Movements with no close match
--    keep the placeholder rather than show the wrong exercise.
--
-- Photos come from free-exercise-db (public domain, the Unlicense).

alter table public.exercises add column if not exists demo_note text;

update public.exercises e
set image_urls = d.image_urls,
    demo_note  = 'Photos show a similar movement: ' || d.name
from (values
  ('incline-machine-fly', 'butterfly'),
  ('machine-incline-chest-press', 'leverage-incline-chest-press'),
  ('seated-cable-fly', 'cable-crossover'),
  ('single-arm-cable-fly', 'cable-crossover'),
  ('plate-loaded-wide-chest-press', 'leverage-chest-press'),
  ('seated-machine-row', 'leverage-iso-row'),
  ('machine-lat-pulldown', 'lat-pulldown'),
  ('assisted-pull-up', 'band-assisted-pull-up'),
  ('machine-pullover', 'straight-arm-pulldown'),
  ('single-arm-cable-row', 'seated-one-arm-cable-pulley-rows'),
  ('wide-grip-seated-cable-row', 'seated-cable-row'),
  ('back-extension-machine', 'hyperextensions-back-extensions'),
  ('machine-lateral-raise', 'cable-seated-lateral-raise'),
  ('machine-rear-delt-row', 'cable-rope-rear-delt-rows'),
  ('cable-rope-upright-row', 'upright-cable-row'),
  ('bayesian-cable-curl', 'standing-biceps-cable-curl'),
  ('cable-triceps-kickback', 'tricep-dumbbell-kickback'),
  ('single-arm-cable-pushdown', 'cable-one-arm-tricep-extension'),
  ('machine-wrist-curl', 'cable-wrist-curl'),
  ('pendulum-squat', 'hack-squat'),
  ('v-squat', 'hack-squat'),
  ('hip-thrust-machine', 'hip-thrust'),
  ('glute-kickback-machine', 'glute-kickback'),
  ('cable-hip-abduction', 'thigh-abductor'),
  ('single-leg-leg-press', 'leg-press'),
  ('meadows-row', 'one-arm-long-bar-row'),
  ('captains-chair-leg-raise', 'knee-hip-raise-on-parallel-bars')
) as m(slug, donor)
join public.exercises d on d.slug = m.donor and d.created_by is null
where e.slug = m.slug
  and e.created_by is null
  and cardinality(e.image_urls) = 0
  and cardinality(d.image_urls) > 0;

-- Farmer's Walk is in free-exercise-db (filed under strongman), same movement.
update public.exercises
set image_urls = '{"https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Farmers_Walk/0.jpg","https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Farmers_Walk/1.jpg"}'::text[]
where slug = 'farmers-carry' and created_by is null and cardinality(image_urls) = 0;
