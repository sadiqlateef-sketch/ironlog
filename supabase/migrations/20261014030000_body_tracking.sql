-- Body tab: weight / body fat / waist history and private progress photos.

-- One row per day. Logging a second value on the same day fills in that row.
create table public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.users (id) on delete cascade,
  measured_on  date not null default current_date,
  weight_kg    numeric(6,2) check (weight_kg is null or weight_kg between 20 and 400),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or body_fat_pct between 2 and 70),
  waist_cm     numeric(5,1) check (waist_cm is null or waist_cm between 30 and 250),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, measured_on)
);

create trigger body_measurements_updated_at
  before update on public.body_measurements
  for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;

create policy "body_measurements: own rows" on public.body_measurements
  for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Progress photos live in a private bucket, one folder per user
-- (<user id>/<file>). Nobody else can list or open them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "progress photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "progress photos: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "progress photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
