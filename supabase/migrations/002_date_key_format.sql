-- ═══════════════════════════════════════════════════════════════════════════
-- 002_date_key_format.sql
-- One-time rewrite of every date-key column from the old "YYYY-M-D"
-- (0-indexed month) format to the canonical zero-padded "YYYY-MM-DD"
-- (1-indexed month) format. See tasks/003 (plan) and tasks/004 (execution).
--
-- ⚠️  RUN EXACTLY ONCE. Both old- and new-format values match the guard
-- regex below (e.g. "2026-06-01" and "2026-6-1" are both valid matches), so
-- re-running this after it has already been applied would shift already-
-- migrated dates by a further +1 month and corrupt them. There is no safe
-- idempotent re-run for this one — confirm via current-state.md whether it
-- has already been applied before running it again.
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE tasks SET date =
  split_part(date, '-', 1) || '-' ||
  lpad((split_part(date, '-', 2)::int + 1)::text, 2, '0') || '-' ||
  lpad(split_part(date, '-', 3)::int::text, 2, '0')
WHERE date ~ '^\d{4}-\d{1,2}-\d{1,2}$';

UPDATE workout_done_log SET date =
  split_part(date, '-', 1) || '-' ||
  lpad((split_part(date, '-', 2)::int + 1)::text, 2, '0') || '-' ||
  lpad(split_part(date, '-', 3)::int::text, 2, '0')
WHERE date ~ '^\d{4}-\d{1,2}-\d{1,2}$';

UPDATE pb_log SET date =
  split_part(date, '-', 1) || '-' ||
  lpad((split_part(date, '-', 2)::int + 1)::text, 2, '0') || '-' ||
  lpad(split_part(date, '-', 3)::int::text, 2, '0')
WHERE date ~ '^\d{4}-\d{1,2}-\d{1,2}$';
