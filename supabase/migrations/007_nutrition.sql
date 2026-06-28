-- ═══════════════════════════════════════════════════════════════════════════
-- 007_nutrition.sql  —  Nutrition domain: manual + photo meal logging (task 028)
--
-- Adds exactly the two tables task 028 scopes: meals, nutrition_targets.
-- meal_plans / recipes / grocery_lists / fridge_contents are the FUTURE
-- meal-planning sub-feature (task 062) and are intentionally NOT created here.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- `date` is the canonical zero-padded 'YYYY-MM-DD', user-local (see lib/dateKey.ts).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── meals ────────────────────────────────────────────────────────────────────
-- One row per logged meal. `logged_via` distinguishes 'manual' | 'photo' | 'quick_add'.
CREATE TABLE IF NOT EXISTS meals (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD', user-local
  meal_type   TEXT        NOT NULL DEFAULT 'snack',  -- 'breakfast'|'lunch'|'dinner'|'snack'
  name        TEXT        NOT NULL DEFAULT '',
  calories    INT         NOT NULL DEFAULT 0,
  protein_g   NUMERIC     NOT NULL DEFAULT 0,
  carbs_g     NUMERIC     NOT NULL DEFAULT 0,
  fat_g       NUMERIC     NOT NULL DEFAULT 0,
  photo_url   TEXT,
  logged_via  TEXT        NOT NULL DEFAULT 'manual',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own meals" ON meals;
CREATE POLICY "own meals" ON meals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_meals_user_date ON meals (user_id, date);

-- ── nutrition_targets ────────────────────────────────────────────────────────
-- One row per user. Seeded by onboarding (task 060) later; until then the app
-- uses sensible code defaults (see lib/meals-data.ts).
CREATE TABLE IF NOT EXISTS nutrition_targets (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  calories      INT         NOT NULL DEFAULT 2000,
  protein_g     INT         NOT NULL DEFAULT 150,
  carbs_g       INT         NOT NULL DEFAULT 200,
  fat_g         INT         NOT NULL DEFAULT 65,
  water_ml      INT         NOT NULL DEFAULT 3000,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE nutrition_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own nutrition targets" ON nutrition_targets;
CREATE POLICY "own nutrition targets" ON nutrition_targets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
