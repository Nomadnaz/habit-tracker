-- ═══════════════════════════════════════════════════════════════════════════
-- 013_user_profiles.sql  —  Core user profile table (task 062 dependency)
--
-- database.md scoped this under "Core user / AI plumbing" (task 006), but
-- 006_ai_companions.sql never actually created it — only the companion/AI
-- plumbing tables. Onboarding (task 062) needs onboarding_complete to exist
-- somewhere durable, so it's added here rather than blocking onboarding on
-- a rename of an already-shipped migration (never edit a shipped migration
-- — database.md's rule).
--
-- Only the fields onboarding actually collects are included (name, age, sex,
-- height/weight, dietary_preferences, onboarding_complete) — the rest of
-- database.md's user_profiles columns (photo_url, display_cards[],
-- featured_badges[], ranking_opted_in, subscription_tier, gym_lat/lng) are
-- FUTURE (badges/social/gym-checkin/monetisation, none built yet) and are
-- left off until a task actually needs them — additive migrations are cheap.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT,
  age                   INT,
  sex                   TEXT,
  height_cm             NUMERIC,
  weight_kg             NUMERIC,
  goal_weight_kg        NUMERIC,
  dietary_preferences   TEXT[]      NOT NULL DEFAULT '{}',
  onboarding_complete   BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile" ON user_profiles;
CREATE POLICY "own profile" ON user_profiles FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
