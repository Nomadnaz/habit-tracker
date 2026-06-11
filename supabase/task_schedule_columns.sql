-- Run in Supabase SQL editor to persist task time, length, and location in the cloud.
alter table public.tasks add column if not exists hour smallint;
alter table public.tasks add column if not exists minute smallint;
alter table public.tasks add column if not exists duration_mins integer;
alter table public.tasks add column if not exists location text;
