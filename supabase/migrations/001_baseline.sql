-- ═══════════════════════════════════════════════════════════════════════════
-- 001_baseline.sql
-- Consolidates the loose SQL files that were run manually in the Supabase SQL
-- editor before this migrations/ folder existed. Reproduces the schema as it
-- actually exists in production today — no schema changes, no renames.
--
-- Source files folded in (now superseded by this migration, kept for history):
--   supabase/run-this-once.sql          — authoritative for workout_templates/
--                                          exercises/workout_exercises (the
--                                          version actually wired up in
--                                          lib/workout-data.ts)
--   supabase/user_focus.sql             — superseded by run-this-once.sql's
--                                          user_focus + the durations columns below
--   supabase/user_focus_durations.sql   — adds work_mins/break_mins to user_focus
--   supabase/task_schedule_columns.sql  — adds hour/minute/duration_mins/location to tasks
--
-- NOT included: supabase/workout-schema.sql. It defines a conflicting,
-- UUID-keyed workout_templates/exercises schema and three tables
-- (workout_sessions, session_sets, user_goals) that are never referenced
-- anywhere in lib/ or app/ — confirmed dead, superseded by run-this-once.sql.
-- Left on disk for history; do not run it.
--
-- Safe to re-run: CREATE TABLE/COLUMN IF NOT EXISTS throughout.
--
-- ⚠️  Date columns below are still 'YYYY-M-D' (0-indexed month) — this matches
-- production data as it exists today. The canonical zero-padded YYYY-MM-DD
-- format is the target of tasks/003-004 (a data + code migration), not
-- something this baseline migration changes.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── TASKS (TODAY screen) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,   -- 'YYYY-M-D' (month 0-indexed, matches app) — see tasks/003-004
  label       TEXT        NOT NULL DEFAULT '',
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  priority    TEXT,                   -- 'LOW' | 'MEDIUM' | 'HIGH' | null
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tasks" ON tasks;
CREATE POLICY "own tasks" ON tasks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks (user_id, date);

-- task_schedule_columns.sql deltas
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS hour SMALLINT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS minute SMALLINT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS duration_mins INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS location TEXT;


-- ── FOCUS SETTINGS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_focus (
  user_id     UUID  PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT  NOT NULL DEFAULT '',
  block_idx   INT   NOT NULL DEFAULT 3,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_focus ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own focus" ON user_focus;
CREATE POLICY "own focus" ON user_focus FOR ALL USING (auth.uid() = user_id);

-- user_focus_durations.sql deltas
ALTER TABLE user_focus ADD COLUMN IF NOT EXISTS work_mins INTEGER NOT NULL DEFAULT 90;
ALTER TABLE user_focus ADD COLUMN IF NOT EXISTS break_mins INTEGER NOT NULL DEFAULT 20;


-- ── WORKOUT TEMPLATES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_templates (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  colour      TEXT        NOT NULL DEFAULT '#FF4D00',
  is_archived BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own templates" ON workout_templates;
CREATE POLICY "own templates" ON workout_templates FOR ALL USING (auth.uid() = user_id);


-- ── EXERCISES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exercises (
  id             TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  muscle_groups  TEXT[]      NOT NULL DEFAULT '{}',
  movement_type  TEXT        NOT NULL DEFAULT 'push',
  sets           INT         NOT NULL DEFAULT 3,
  reps           TEXT        NOT NULL DEFAULT '10',
  weight_kg      FLOAT       NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own exercises" ON exercises;
CREATE POLICY "own exercises" ON exercises FOR ALL USING (auth.uid() = user_id);


-- ── WORKOUT–EXERCISE JUNCTION ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workout_exercises (
  id                  TEXT    PRIMARY KEY,
  user_id             UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_template_id TEXT    NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id         TEXT    NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  order_index         INT     NOT NULL DEFAULT 0,
  UNIQUE (workout_template_id, exercise_id)
);
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own junctions" ON workout_exercises;
CREATE POLICY "own junctions" ON workout_exercises FOR ALL USING (auth.uid() = user_id);


-- ── WORKOUT DONE LOG ─────────────────────────────────────────────────────────
-- One row per (user, date, template) — marks that the user did that workout that day.
CREATE TABLE IF NOT EXISTS workout_done_log (
  id                  TEXT        PRIMARY KEY,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_template_id TEXT        NOT NULL,
  date                TEXT        NOT NULL,  -- 'YYYY-M-D' — see tasks/003-004
  logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, workout_template_id, date)
);
ALTER TABLE workout_done_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own done log" ON workout_done_log;
CREATE POLICY "own done log" ON workout_done_log FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_done_log_user ON workout_done_log (user_id, date);


-- ── PERSONAL BEST LOG ────────────────────────────────────────────────────────
-- One row per (user, exercise, date) — the best weight lifted that day.
CREATE TABLE IF NOT EXISTS pb_log (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id TEXT        NOT NULL,
  weight_kg   FLOAT       NOT NULL,
  date        TEXT        NOT NULL,  -- 'YYYY-M-D' — see tasks/003-004
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, exercise_id, date)
);
ALTER TABLE pb_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own pb log" ON pb_log;
CREATE POLICY "own pb log" ON pb_log FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_pb_log_user ON pb_log (user_id, exercise_id);


-- ── WATER LOGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS water_logs (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_ml  INT         NOT NULL,
  logged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE water_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own water" ON water_logs;
CREATE POLICY "own water" ON water_logs FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_water_user ON water_logs (user_id, logged_at DESC);


-- ── BODY WEIGHT LOGS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS body_weight_logs (
  id         TEXT        PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_kg  FLOAT       NOT NULL,
  logged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE body_weight_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own weight" ON body_weight_logs;
CREATE POLICY "own weight" ON body_weight_logs FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_weight_user ON body_weight_logs (user_id, logged_at DESC);
