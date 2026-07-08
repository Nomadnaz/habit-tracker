-- ═══════════════════════════════════════════════════════════════════════════
-- 027_vault_inbox.sql  —  vault_inbox (Companion HUD voice capture)
--
-- Device voice notes ("note: buy protein powder") land here via the
-- device-state Edge Function. The Mac vault agent (tools/vault-agent) reads
-- unsynced rows, writes them as Obsidian Inbox/*.md files, and stamps
-- synced_at. Kept separate from vault_files on purpose: vault_files mirrors
-- disk truth and the agent is its only writer (vault canon, one-directional
-- sync per Obsidian Second Brain Sync spec).
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vault_inbox (
  id          TEXT        PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  source      TEXT        NOT NULL DEFAULT 'device' CHECK (source IN ('device', 'app')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at   TIMESTAMPTZ
);
ALTER TABLE vault_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own vault inbox" ON vault_inbox;
CREATE POLICY "own vault inbox" ON vault_inbox FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_vault_inbox_user_unsynced
  ON vault_inbox (user_id, created_at) WHERE synced_at IS NULL;
