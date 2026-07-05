-- ═══════════════════════════════════════════════════════════════════════════
-- 015_badges.sql  —  Badge launch set (task 063)
--
-- Only badges_earned — the catalogue itself is a static config (lib/badges.ts),
-- per database.md's own note under "Badges (task 063)": no `badges` table
-- unless the catalogue needs to be editable without a redeploy, which it
-- doesn't for a ~10-badge launch set.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS badges_earned (
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id            TEXT        NOT NULL,
  earned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  displayed_on_profile BOOLEAN    NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, badge_id)
);
ALTER TABLE badges_earned ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own badges" ON badges_earned;
CREATE POLICY "own badges" ON badges_earned FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
