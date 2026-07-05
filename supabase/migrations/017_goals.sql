-- ═══════════════════════════════════════════════════════════════════════════
-- 017_goals.sql  —  Goals domain (task 068), structured part only
--
-- goals, milestones, goal_logs — the vision board (affirmations,
-- vision_board_items) is explicitly "optional polish, can ship after the
-- structured part" per the task itself; not created here.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS goals (
  id           TEXT        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  category     TEXT,
  why          TEXT,
  target_date  TEXT,        -- canonical 'YYYY-MM-DD', optional
  status       TEXT        NOT NULL DEFAULT 'active',  -- 'active' | 'done' | 'abandoned'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own goals" ON goals;
CREATE POLICY "own goals" ON goals FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS milestones (
  id            TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id       TEXT        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  deadline      TEXT,
  completed     BOOLEAN     NOT NULL DEFAULT FALSE,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own milestones" ON milestones;
CREATE POLICY "own milestones" ON milestones FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_goal ON milestones (goal_id);

CREATE TABLE IF NOT EXISTS goal_logs (
  id                TEXT        PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id           TEXT        NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date              TEXT        NOT NULL,
  note              TEXT,
  progress_percent  INT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE goal_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own goal logs" ON goal_logs;
CREATE POLICY "own goal logs" ON goal_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_goal_logs_goal ON goal_logs (goal_id, date);
