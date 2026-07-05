-- ═══════════════════════════════════════════════════════════════════════════
-- 016_cumulative_stats.sql  —  Fixes a long-standing gap in lib/postWrite.ts
--
-- Task 014 (postWrite fan-out) has always required step 1 ("cumulative_stats
-- increment") to be LIVE for MVP, but the table itself was never created —
-- incrementCumulativeStats() has been a console.log stub since the function
-- was written. Adding it now so that stub can finally do real work (this
-- session, alongside the badges launch set, task 063, which reads some of
-- the same underlying counts).
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cumulative_stats (
  user_id                    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  total_steps                BIGINT      NOT NULL DEFAULT 0,
  total_distance_walked_m    NUMERIC     NOT NULL DEFAULT 0,
  total_distance_run_m       NUMERIC     NOT NULL DEFAULT 0,
  total_gym_sessions         INT         NOT NULL DEFAULT 0,
  total_focus_secs           INT         NOT NULL DEFAULT 0,
  total_habits_completed     INT         NOT NULL DEFAULT 0,
  total_books_finished       INT         NOT NULL DEFAULT 0,
  total_movies_watched       INT         NOT NULL DEFAULT 0,
  longest_streak_ever        INT         NOT NULL DEFAULT 0,
  last_updated               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cumulative_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own cumulative stats" ON cumulative_stats;
CREATE POLICY "own cumulative stats" ON cumulative_stats FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
