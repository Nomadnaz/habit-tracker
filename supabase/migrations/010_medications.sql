-- ═══════════════════════════════════════════════════════════════════════════
-- 010_medications.sql  —  Medication & Supplements domain (task 024)
--
-- Adds the two tables task 024 scopes: medications, medication_logs. Lives
-- as a sub-section of the Habits tab (app/(tabs)/habits.tsx), not its own tab.
-- `cycle_linked`/medication_logs.cycle_day match the canonical schema in
-- database.md but are not read/written by any UI yet — Cycle (task 067) is
-- FUTURE and opt-in; the columns just avoid a later schema change.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Date columns are the canonical zero-padded 'YYYY-MM-DD', user-local (lib/dateKey.ts).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── medications ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medications (
  id             TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  type           TEXT        NOT NULL DEFAULT 'medication',  -- 'medication' | 'supplement'
  dose_amount    NUMERIC,
  dose_unit      TEXT,
  frequency      TEXT        NOT NULL DEFAULT 'daily',
  course_start   TEXT,                                        -- canonical 'YYYY-MM-DD', nullable (ongoing)
  course_end     TEXT,
  course_length  INT,                                          -- total days, for 'Day X of Y'
  reminder_time  TEXT,
  cycle_linked   BOOLEAN     NOT NULL DEFAULT FALSE,
  notes          TEXT,
  active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE medications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own medications" ON medications;
CREATE POLICY "own medications" ON medications FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── medication_logs ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS medication_logs (
  id            TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_id TEXT        NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  date          TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD', user-local
  taken         BOOLEAN     NOT NULL DEFAULT TRUE,
  dose_taken    NUMERIC,
  cycle_day     INT,
  notes         TEXT,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE medication_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own medication logs" ON medication_logs;
CREATE POLICY "own medication logs" ON medication_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_medication_logs_med_date ON medication_logs (medication_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_medication_logs_med_date ON medication_logs (medication_id, date);
