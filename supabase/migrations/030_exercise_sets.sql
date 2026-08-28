-- ═══════════════════════════════════════════════════════════════════════════
-- 030_exercise_sets.sql  —  exercise_sets (rep-sensor pivot, handover-8)
--
-- Reps/ROM/velocity/tempo are measured (rep-sensor firmware) or spoken
-- (voice/manual), but until now had nowhere to land: `workout_exercises` is a
-- template junction, `workout_done_log` is one row per session, `pb_log` is
-- best-weight-per-day. "6 reps of shoulder press at 20kg" had no destination.
--
-- weight_kg + reps are always present (spoken by the user — there is no force
-- sensor). rom_cm/peak_velocity_mps/tempo_seconds are populated only when
-- source = 'device' (measured by the rep-sensor firmware); null for manual
-- entries. estimated_1rm_kg is computed at write time via Epley
-- (weight * (1 + reps/30)) so PB comparisons (see log_pb / log_set in
-- _shared/actionExecutor.ts) don't need to recompute it from every historical
-- row.
--
-- Matches pb_log's existing convention: exercise_id is TEXT, not FK'd to
-- exercises(id) — exercises are seeded client-side (AsyncStorage) before ever
-- reaching Supabase, so a hard FK would reject a set logged before that
-- exercise's background sync lands.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exercise_sets (
  id                 TEXT        PRIMARY KEY,
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id        TEXT        NOT NULL,
  date               TEXT        NOT NULL,              -- canonical 'YYYY-MM-DD'
  weight_kg          FLOAT       NOT NULL,
  reps               INT         NOT NULL,
  estimated_1rm_kg   FLOAT       NOT NULL,               -- Epley: weight_kg * (1 + reps/30)
  rom_cm             FLOAT,                              -- device-measured only
  peak_velocity_mps  FLOAT,                              -- device-measured only
  tempo_seconds      FLOAT,                              -- device-measured only
  source             TEXT        NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'device')),
  logged_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE exercise_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own exercise sets" ON exercise_sets;
CREATE POLICY "own exercise sets" ON exercise_sets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_exercise_sets_user ON exercise_sets (user_id, exercise_id, date DESC);
