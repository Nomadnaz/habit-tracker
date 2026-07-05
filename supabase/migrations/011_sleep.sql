-- ═══════════════════════════════════════════════════════════════════════════
-- 011_sleep.sql  —  Sleep domain: manual logging + Phone Down Challenge (task 035)
--
-- Adds exactly the three tables task 035 scopes: sleep_logs, sleep_phone_logs,
-- winddown_logs. sleep_stages/sleep_movement_logs/sleep_correlations are
-- wearable-only (task 048 territory) and intentionally NOT created here —
-- there is nothing to populate them yet. winddown_logs has no screen wired
-- to it yet (no task builds one) but the table is added now per 035's scope.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Date columns are the canonical zero-padded 'YYYY-MM-DD', user-local (lib/dateKey.ts).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── sleep_logs ───────────────────────────────────────────────────────────────
-- One row per night, manually logged (or HealthKit-sourced later, task 042).
CREATE TABLE IF NOT EXISTS sleep_logs (
  id            TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD' — the wake-up day
  bedtime       TEXT,                    -- 'HH:MM', 24h, local
  wake_time     TEXT,                    -- 'HH:MM', 24h, local
  total_hours   NUMERIC,
  quality_score INT,                     -- 1-5
  notes         TEXT,
  source_device TEXT        NOT NULL DEFAULT 'manual',  -- 'manual' | 'healthkit'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sleep_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own sleep logs" ON sleep_logs;
CREATE POLICY "own sleep logs" ON sleep_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sleep_logs_user_date ON sleep_logs (user_id, date);

-- ── sleep_phone_logs ─────────────────────────────────────────────────────────
-- The Phone Down Challenge: did the user put their phone down by their target
-- time? iOS Sleep Focus auto-detection is device-gated (needs Screen Time /
-- Shortcuts integration — task 042 territory); this table also serves the
-- manual-entry fallback the app ships with today.
CREATE TABLE IF NOT EXISTS sleep_phone_logs (
  id                     TEXT        PRIMARY KEY,
  user_id                UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                   TEXT        NOT NULL,
  phone_down_time        TEXT,        -- 'HH:MM', when the phone was set down
  first_morning_unlock   TEXT,        -- 'HH:MM'
  total_phone_free_mins  INT,
  sleep_focus_activated  BOOLEAN     NOT NULL DEFAULT FALSE,  -- true once auto-detection lands
  challenge_result       TEXT,        -- 'pass' | 'close' | 'fail'
  streak_count           INT         NOT NULL DEFAULT 0,      -- separate from general habit streaks
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sleep_phone_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own sleep phone logs" ON sleep_phone_logs;
CREATE POLICY "own sleep phone logs" ON sleep_phone_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sleep_phone_logs_user_date ON sleep_phone_logs (user_id, date);

-- ── winddown_logs ────────────────────────────────────────────────────────────
-- No screen reads/writes this yet — no task builds a winddown-routine UI.
-- Table exists now so 035's full scope is covered without a later migration.
CREATE TABLE IF NOT EXISTS winddown_logs (
  user_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date               TEXT        NOT NULL,
  routine_items      TEXT[]      NOT NULL DEFAULT '{}',
  completion_percent INT         NOT NULL DEFAULT 0,
  streak_count       INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
ALTER TABLE winddown_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own winddown logs" ON winddown_logs;
CREATE POLICY "own winddown logs" ON winddown_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
