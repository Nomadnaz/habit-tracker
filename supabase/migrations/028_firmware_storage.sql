-- ═══════════════════════════════════════════════════════════════════════════
-- 028_firmware_storage.sql  —  Supabase Storage bucket for OTA firmware
--
-- The Companion HUD ESP32 device checks for updates before any login/auth
-- flow can run, so it has no way to present a JWT when fetching the OTA
-- manifest/binary. This bucket is PUBLIC (read-only to anyone with the
-- URL) so the device can GET it unauthenticated — same tradeoff any
-- consumer-hardware OTA system makes. Writes are locked to service_role
-- (only `tools/release_ota.sh` / the backend publishes new firmware).
-- Path convention: firmware/latest.json (manifest) + firmware/<version>.bin.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('firmware', 'firmware', true)
on conflict (id) do nothing;

create policy "firmware: public read"
  on storage.objects for select
  to public
  using (bucket_id = 'firmware');

create policy "firmware: service role write"
  on storage.objects for all
  to service_role
  using (bucket_id = 'firmware')
  with check (bucket_id = 'firmware');
