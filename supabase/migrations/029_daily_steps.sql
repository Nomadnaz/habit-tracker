-- ═══════════════════════════════════════════════════════════════════════════
-- 029_daily_steps.sql  —  daily_steps (Code Audit v2 fix plan, P2/B2)
--
-- Steps previously lived ONLY in the local `@body` AsyncStorage blob — no
-- server-side buildContext handler could ever see them, so no AI companion
-- could ever answer a steps question. This table gives lib/body-data.ts's
-- Apple Health merge path (and any future step source) somewhere to upsert
-- today's count, local-first as everywhere else in this app (fire-and-forget,
-- AsyncStorage stays the source of truth for the UI).
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS daily_steps (
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,              -- canonical 'YYYY-MM-DD', user-local
  steps       INT         NOT NULL DEFAULT 0,
  source      TEXT        NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'healthkit')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);
ALTER TABLE daily_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own daily steps" ON daily_steps;
CREATE POLICY "own daily steps" ON daily_steps FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
