-- ═══════════════════════════════════════════════════════════════════════════
-- 003_gym_body_reconcile.sql
-- DRAFT — written by tasks/005. Additive only: extends the existing,
-- already-wired-up gym/body schema to cover the spec's Gym Page and Body
-- Page feature set, rather than introducing a parallel workouts/
-- personal_bests/body_logs schema. See database.md "EXISTING SCHEMA" section
-- for the full rationale. No destructive renames — gym.tsx / workouts.tsx /
-- workout-detail.tsx continue to work unmodified after this runs.
-- ═══════════════════════════════════════════════════════════════════════════

-- workout_done_log becomes the real session log (spec's "workouts" concept)
-- instead of a pure boolean marker — adds the fields the Gym Page spec needs
-- per logged session (duration, GPS check-in, heart rate, calories, notes).
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS duration_mins INTEGER;
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS gym_checkin_lat DOUBLE PRECISION;
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS gym_checkin_lng DOUBLE PRECISION;
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS hr_avg INTEGER;
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS hr_max INTEGER;
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS calories_est INTEGER;
ALTER TABLE workout_done_log ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

-- pb_log gains reps, to match the spec's personal_bests(weight_kg, reps).
ALTER TABLE pb_log ADD COLUMN IF NOT EXISTS reps INTEGER;

-- gym_plan is genuinely new — the spec's Push/Pull/Legs day planner has no
-- existing equivalent. One row per user, one column per weekday holding a
-- session_type string (or NULL for rest); the app already has session-type
-- vocabulary via exercises.movement_type.
CREATE TABLE IF NOT EXISTS gym_plan (
  user_id   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  monday    TEXT,
  tuesday   TEXT,
  wednesday TEXT,
  thursday  TEXT,
  friday    TEXT,
  saturday  TEXT,
  sunday    TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE gym_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own gym plan" ON gym_plan;
CREATE POLICY "own gym plan" ON gym_plan FOR ALL USING (auth.uid() = user_id);

-- body_logs (spec) is NOT introduced as a separate table — body_weight_logs
-- and water_logs already cover that ground with a more granular, multi-
-- entry-per-day design than the spec's single-row-per-day body_logs. Steps,
-- vitamins_taken[], and notes are deferred until a task actually needs them
-- (tasks/034 — Body page hub), added as new columns on the existing tables
-- at that point, not as a new table now.
