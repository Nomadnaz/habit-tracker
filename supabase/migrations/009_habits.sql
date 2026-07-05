-- ═══════════════════════════════════════════════════════════════════════════
-- 009_habits.sql  —  Habits domain (task 022 / 023)
--
-- Adds the four tables task 022 scopes: habits, habit_logs, streak_data,
-- streak_events. streak_data/streak_events are written by the app today
-- (per-habit streak calc — see lib/habits-data.ts) but also give a home for
-- freeze/holiday/repair state when task 074 lands, so the columns exist now.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- `date` columns are the canonical zero-padded 'YYYY-MM-DD', user-local (lib/dateKey.ts).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── habits ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habits (
  id             TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  frequency      TEXT        NOT NULL DEFAULT 'daily',  -- 'daily' | 'weekly' for MVP
  reminder_time  TEXT,                                   -- 'HH:MM', optional
  active         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own habits" ON habits;
CREATE POLICY "own habits" ON habits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── habit_logs ───────────────────────────────────────────────────────────────
-- One row per day a habit was marked done. Source of truth for streaks + heatmap.
CREATE TABLE IF NOT EXISTS habit_logs (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id    TEXT        NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD', user-local
  completed   BOOLEAN     NOT NULL DEFAULT TRUE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own habit logs" ON habit_logs;
CREATE POLICY "own habit logs" ON habit_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs (habit_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_habit_logs_habit_date ON habit_logs (habit_id, date);

-- ── streak_data ──────────────────────────────────────────────────────────────
-- One row per (user, habit). Cached current/longest streak; freeze/holiday
-- columns are unused until task 074 wires the freeze/repair UI.
CREATE TABLE IF NOT EXISTS streak_data (
  user_id                    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id                   TEXT        NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  current_streak             INT         NOT NULL DEFAULT 0,
  longest_streak             INT         NOT NULL DEFAULT 0,
  last_completed_date        TEXT,
  freezes_used_this_month    INT         NOT NULL DEFAULT 0,
  repairs_used_this_year     INT         NOT NULL DEFAULT 0,
  holiday_mode_active        BOOLEAN     NOT NULL DEFAULT FALSE,
  holiday_start              TEXT,
  holiday_end                TEXT,
  PRIMARY KEY (user_id, habit_id)
);
ALTER TABLE streak_data ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own streak data" ON streak_data;
CREATE POLICY "own streak data" ON streak_data FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── streak_events ────────────────────────────────────────────────────────────
-- Append-only log of streak-affecting events (freeze/repair/holiday/break).
-- Not read by the MVP screen yet — exists so task 074 has somewhere to write.
CREATE TABLE IF NOT EXISTS streak_events (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id    TEXT        NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,
  type        TEXT        NOT NULL,   -- 'freeze' | 'repair' | 'holiday_start' | 'holiday_end' | 'break'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE streak_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own streak events" ON streak_events;
CREATE POLICY "own streak events" ON streak_events FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
