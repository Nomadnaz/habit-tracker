-- ═══════════════════════════════════════════════════════════════════════════
-- 026_focus_sessions.sql  —  focus_sessions (Companion HUD device surface)
--
-- The device's TIMER tab logs completed/paused focus sessions through the
-- device-state Edge Function so streaks/coaching can see real focus time.
-- Kept minimal: one row per session, duration only — the device has no
-- concept of which task the session was for (yet).
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS focus_sessions (
  id             TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date           TEXT        NOT NULL,              -- canonical 'YYYY-MM-DD', user-local
  duration_mins  INT         NOT NULL DEFAULT 0,
  source         TEXT        NOT NULL DEFAULT 'device' CHECK (source IN ('device', 'app')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own focus sessions" ON focus_sessions;
CREATE POLICY "own focus sessions" ON focus_sessions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_date ON focus_sessions (user_id, date DESC);
