-- ═══════════════════════════════════════════════════════════════════════════
-- RUN THIS ONCE in the Supabase SQL editor (supabase.com → your project →
-- SQL Editor → New query → paste everything below → Run)
--
-- What it creates:
--   tasks            — TODAY screen tasks (may already exist)
--   user_focus       — focus name + block setting (may already exist)
--   workout_templates — Push Day / Pull Day / Legs etc.
--   exercises         — exercise library
--   workout_exercises — which exercises are in each template (junction)
--   workout_done_log  — days user marked a workout as done
--   pb_log            — personal best weights per exercise
--   water_logs        — daily water intake entries
--   body_weight_logs  — body weight entries
--
-- Every table has Row Level Security: users can only read/write their own rows.
-- Safe to re-run — uses CREATE TABLE IF NOT EXISTS throughout.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── TASKS (TODAY screen) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,   -- 'YYYY-M-D' (month 0-indexed, matches app)
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
  date                TEXT        NOT NULL,  -- 'YYYY-M-D'
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
  date        TEXT        NOT NULL,  -- 'YYYY-M-D'
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
