-- ═══════════════════════════════════════════════════════════════════════════
-- 006_ai_companions.sql  —  AI companion + AI plumbing tables (task 006)
--
-- Canonical-aligned to database.md "Core user / AI plumbing (tasks/006)".
-- Creates exactly the six tables task 006 scopes: companions, companion_messages,
-- companion_personas (PER-USER), api_usage, briefing_preferences, user_context_summary.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent: CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS + CREATE / IF NOT EXISTS
-- indexes — safe to run and re-run in the Supabase SQL editor.
--
-- NOTE (intentional, vs. an earlier divergent draft):
--   * companion_personas is PER-USER persona config, NOT a global system-prompt table.
--     System prompt / model / contextSources / allowed-actions config lives in CODE
--     (lib/companions.ts, task 007), never in the database.
--   * user_context_summary holds profile_md / assistant_notes_md (personal-context layer,
--     task 057), NOT a generic context_json cache.
--   * No persona seed here, and no action is pre-authorised — actions stay preview/gated.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── companions ───────────────────────────────────────────────────────────────
-- The user's instantiated companions (one per type per user).
CREATE TABLE IF NOT EXISTS companions (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL,   -- canonical names: 'habitCoach','life','gym','focus',...
  name        TEXT        NOT NULL,
  photo_url   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own companions" ON companions;
CREATE POLICY "own companions" ON companions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_companions_user_type ON companions (user_id, type);

-- ── companion_messages ───────────────────────────────────────────────────────
-- Chat history: one row per message (role = 'user' | 'assistant').
CREATE TABLE IF NOT EXISTS companion_messages (
  id              TEXT        PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_type  TEXT        NOT NULL,
  role            TEXT        NOT NULL,   -- 'user' | 'assistant'
  content         TEXT        NOT NULL,
  actions_json    JSONB,                  -- extracted <action> payload, if any
  model_used      TEXT,                   -- e.g. 'claude-haiku-4-5'
  tokens_in       INT,
  tokens_out      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE companion_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own messages" ON companion_messages;
CREATE POLICY "own messages" ON companion_messages FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_companion
  ON companion_messages (user_id, companion_type, created_at DESC);

-- ── companion_personas (PER-USER) ────────────────────────────────────────────
-- The user's per-companion persona customisation (name/tone/backstory/etc.).
-- One row per (user, companion_type). NOT system-prompt config.
CREATE TABLE IF NOT EXISTS companion_personas (
  user_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  companion_type       TEXT        NOT NULL,
  name                 TEXT,
  photo_url            TEXT,
  personality_preset   TEXT,       -- 'strict_coach' | 'supportive_friend' | ...
  communication_style  TEXT,       -- 'formal' | 'casual' | 'blunt' | ...
  custom_tone_example  TEXT,
  backstory            TEXT,
  relationship_dynamic TEXT,       -- 'coach' | 'friend' | 'mentor' | 'assistant'
  user_nickname        TEXT,
  language             TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, companion_type)
);
ALTER TABLE companion_personas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own personas" ON companion_personas;
CREATE POLICY "own personas" ON companion_personas FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── api_usage ────────────────────────────────────────────────────────────────
-- Server-side daily rate limiting + cost visibility (one row per user per day).
CREATE TABLE IF NOT EXISTS api_usage (
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             TEXT        NOT NULL,   -- canonical 'YYYY-MM-DD', user-local
  message_count    INT         NOT NULL DEFAULT 0,
  tokens_in        INT         NOT NULL DEFAULT 0,
  tokens_out       INT         NOT NULL DEFAULT 0,
  last_message_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, date)
);
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own usage" ON api_usage;
CREATE POLICY "own usage" ON api_usage FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── briefing_preferences ─────────────────────────────────────────────────────
-- Which companion modules feed the daily briefing, and when to deliver it.
CREATE TABLE IF NOT EXISTS briefing_preferences (
  user_id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  selected_modules   TEXT[]      NOT NULL DEFAULT '{}',
  notification_time  TEXT,       -- 'HH:MM' user-local
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE briefing_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own briefing" ON briefing_preferences;
CREATE POLICY "own briefing" ON briefing_preferences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── user_context_summary ─────────────────────────────────────────────────────
-- Personal-context layer (task 057): regenerated profile + assistant-learned notes.
-- Exactly one row per user (PK on user_id) — task 006 acceptance criterion.
CREATE TABLE IF NOT EXISTS user_context_summary (
  user_id             UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_md          TEXT,       -- regenerated daily from the user's data
  assistant_notes_md  TEXT,       -- things the assistant has learned/been told to remember
  profile_updated_at  TIMESTAMPTZ,
  notes_updated_at    TIMESTAMPTZ,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_context_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own context" ON user_context_summary;
CREATE POLICY "own context" ON user_context_summary FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
