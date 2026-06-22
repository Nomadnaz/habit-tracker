-- ─────────────────────────────────────────────────────────────────────────
-- SUPERSEDED — DEAD CODE, DO NOT RUN.
-- This schema (UUID-keyed workout_templates/exercises, plus workout_sessions/
-- session_sets/user_goals) is never referenced anywhere in lib/ or app/.
-- The schema actually wired up is run-this-once.sql, now in
-- supabase/migrations/001_baseline.sql. Kept on disk for history only.
-- ─────────────────────────────────────────────────────────────────────────
--
-- WORKOUT ENGINE — SUPABASE SCHEMA
-- Run this once in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────────────────

-- Workout templates (Push Day, Pull Day, etc.)
CREATE TABLE IF NOT EXISTS workout_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  colour      TEXT NOT NULL DEFAULT '#FF4D00',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_archived BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own templates" ON workout_templates FOR ALL USING (auth.uid() = user_id);

-- Exercises library
CREATE TABLE IF NOT EXISTS exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  muscle_group  TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('push','pull','legs','upper','lower','cardio')),
  is_compound   BOOLEAN NOT NULL DEFAULT TRUE,
  notes         TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own exercises" ON exercises FOR ALL USING (auth.uid() = user_id);

-- Template → Exercise junction (ordered)
CREATE TABLE IF NOT EXISTS workout_exercises (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id         UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  order_index         INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workout_template_id, exercise_id)
);
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workout_exercises" ON workout_exercises FOR ALL
  USING (auth.uid() = (SELECT user_id FROM workout_templates WHERE id = workout_template_id));

-- Session log
CREATE TABLE IF NOT EXISTS workout_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_template_id UUID REFERENCES workout_templates(id),
  date                TEXT NOT NULL,   -- 'YYYY-M-D', matches app date keys
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  completed           BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT NOT NULL DEFAULT '',
  duration_seconds    INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON workout_sessions FOR ALL USING (auth.uid() = user_id);

-- Individual sets within a session
CREATE TABLE IF NOT EXISTS session_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  set_number  INTEGER NOT NULL,
  weight_kg   FLOAT NOT NULL,
  reps        INTEGER NOT NULL,
  is_pb       BOOLEAN NOT NULL DEFAULT FALSE,
  is_warmup   BOOLEAN NOT NULL DEFAULT FALSE,
  rpe         INTEGER CHECK (rpe BETWEEN 1 AND 10),
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE session_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sets" ON session_sets FOR ALL
  USING (auth.uid() = (SELECT user_id FROM workout_sessions WHERE id = session_id));

-- User goals (headline lifts — 3 exercise IDs)
CREATE TABLE IF NOT EXISTS user_goals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  headline_lift_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own goals" ON user_goals FOR ALL USING (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_session_sets_exercise ON session_sets (exercise_id, is_pb, session_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user ON workout_sessions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_exercises_user        ON exercises (user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user        ON workout_templates (user_id);
