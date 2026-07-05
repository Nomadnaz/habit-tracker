-- ═══════════════════════════════════════════════════════════════════════════
-- 018_finance.sql  —  Finance tracker, manual only (task 065)
--
-- expenses, bills, budgets. bank_connections (Open Banking / TrueLayer) stays
-- with task 051 — not created here; access_token columns must never live
-- anywhere but oauth_tokens per database.md's canonical rule anyway.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expenses (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      NUMERIC     NOT NULL,
  currency    TEXT        NOT NULL DEFAULT 'USD',
  category    TEXT        NOT NULL DEFAULT 'other',
  note        TEXT,
  date        TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own expenses" ON expenses;
CREATE POLICY "own expenses" ON expenses FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses (user_id, date);

CREATE TABLE IF NOT EXISTS bills (
  id           TEXT        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  amount       NUMERIC     NOT NULL,
  due_date     TEXT        NOT NULL,  -- canonical 'YYYY-MM-DD', next due date
  frequency    TEXT        NOT NULL DEFAULT 'monthly',
  last_paid    TEXT,
  auto_renews  BOOLEAN     NOT NULL DEFAULT TRUE,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own bills" ON bills;
CREATE POLICY "own bills" ON bills FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS budgets (
  user_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category              TEXT        NOT NULL,
  monthly_target_amount NUMERIC     NOT NULL,
  PRIMARY KEY (user_id, category)
);
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own budgets" ON budgets;
CREATE POLICY "own budgets" ON budgets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
