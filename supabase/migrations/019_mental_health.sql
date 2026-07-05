-- ═══════════════════════════════════════════════════════════════════════════
-- 019_mental_health.sql  —  Mental health & mood (task 066)
--
-- mood_logs is the MVP-value part and ships fully this session (plaintext —
-- system-model.md's client-side-encryption privacy rule names journal/
-- therapy specifically, not mood). journal_entries/therapy_notes are
-- created here AS SCHEMA ONLY, matching database.md's definition exactly
-- (content_encrypted TEXT) — but NO application code writes to them yet.
-- Task 066 is explicit: "before a single field ships" real client-side
-- encryption (expo-secure-store key, ciphertext only) must exist first.
-- This app has no crypto dependency installed and no device available this
-- session to verify one — shipping a UI on top of an unverified encryption
-- scheme for a mental-health journal would be actively irresponsible. The
-- tables exist so a future session doesn't need another migration; nothing
-- reads or writes their content_encrypted column.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mood_logs (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD'
  mood_score  INT         NOT NULL,   -- 1-10
  stress_score INT,                   -- 1-10, optional
  triggers    TEXT[]      NOT NULL DEFAULT '{}',
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE mood_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own mood logs" ON mood_logs;
CREATE POLICY "own mood logs" ON mood_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mood_logs_user_date ON mood_logs (user_id, date);

-- ── SCHEMA-ONLY — no app code writes here yet, see header comment ──────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id                TEXT        PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              TEXT        NOT NULL,
  content_encrypted TEXT        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own journal entries" ON journal_entries;
CREATE POLICY "own journal entries" ON journal_entries FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS therapy_notes (
  id                TEXT        PRIMARY KEY,
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date              TEXT        NOT NULL,
  content_encrypted TEXT        NOT NULL,
  therapist_name    TEXT,
  next_session      TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE therapy_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own therapy notes" ON therapy_notes;
CREATE POLICY "own therapy notes" ON therapy_notes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
