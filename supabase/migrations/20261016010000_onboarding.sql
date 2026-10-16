-- First-run setup: what you told the app when you signed up, so the program
-- builder (and anything else that asks) starts from your answers.
--  * training_goal / training_equipment / training_days_per_week: the builder's defaults
--  * onboarded_at: set once you finish (or skip) the welcome steps

alter table public.users
  add column if not exists training_goal text
    check (training_goal is null or training_goal in ('strength', 'hypertrophy', 'powerbuilding', 'general')),
  add column if not exists training_equipment text[] not null default '{}',
  add column if not exists training_days_per_week smallint
    check (training_days_per_week is null or training_days_per_week between 2 and 6),
  add column if not exists onboarded_at timestamptz;

-- People who already use the app skip the welcome steps.
update public.users u
   set onboarded_at = now()
 where onboarded_at is null
   and (exists (select 1 from public.workout_sessions s where s.user_id = u.id)
        or exists (select 1 from public.programs p where p.user_id = u.id)
        or exists (select 1 from public.routines r where r.user_id = u.id));
