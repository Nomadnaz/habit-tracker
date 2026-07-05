-- ═══════════════════════════════════════════════════════════════════════════
-- 020_cycle.sql  —  Cycle tracking (task 067), opt-in only
--
-- cycle_logs, cycle_settings. Standard per-user RLS (auth.uid() = user_id) —
-- Postgres RLS has no stricter primitive than row ownership to offer here;
-- the real "stricter" handling is app-level: hidden by default, opt-in only
-- (cycle_settings.opted_in), NEVER queried by buildContext (see companions.ts/
-- buildContext.ts — no 'cycle_logs' contextSource exists anywhere), and a
-- separate Face ID gate (NOT implemented this session — see tasks/067 notes).
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cycle_logs (
  id             TEXT        PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date           TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD'
  type           TEXT        NOT NULL,   -- 'period' | 'symptom' | 'note'
  flow_intensity TEXT,                    -- 'light' | 'medium' | 'heavy', when type='period'
  symptoms       TEXT[]      NOT NULL DEFAULT '{}',
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE cycle_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own cycle logs" ON cycle_logs;
CREATE POLICY "own cycle logs" ON cycle_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS cycle_settings (
  user_id                UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_in               BOOLEAN     NOT NULL DEFAULT FALSE,
  average_cycle_length   INT         NOT NULL DEFAULT 28,
  average_period_length  INT         NOT NULL DEFAULT 5,
  last_period_start      TEXT,
  trying_to_conceive     BOOLEAN     NOT NULL DEFAULT FALSE,
  notifications_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  face_id_lock_enabled   BOOLEAN     NOT NULL DEFAULT TRUE
);
ALTER TABLE cycle_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own cycle settings" ON cycle_settings;
CREATE POLICY "own cycle settings" ON cycle_settings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
