-- ═══════════════════════════════════════════════════════════════════════════
-- 025_meal_photo_storage.sql  —  Supabase Storage bucket for real meal photos
--
-- lib/meals-data.ts's Meal.photoUrl has only ever held a local file URI —
-- there was no Storage bucket anywhere in the repo, so the "photo_url"
-- synced to the meals table was a device-local path meaningless off-device,
-- and photos never survived a reinstall. This creates the bucket + RLS the
-- app now uploads into (see lib/meals-data.ts's addMeal/updateMeal bg()
-- block). Path convention: meal-photos/{user_id}/{meal_id}.jpg — RLS below
-- scopes every operation to the first path segment matching auth.uid().
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

create policy "meal photos: select own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "meal photos: insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "meal photos: update own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "meal photos: delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
