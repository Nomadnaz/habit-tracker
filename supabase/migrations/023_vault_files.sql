-- ═══════════════════════════════════════════════════════════════════════════
-- 023_vault_files.sql  —  vault_files (task 057)
--
-- user_context_summary already exists (migration 006_ai_companions.sql) —
-- this task only adds vault_files, the personal-context layer's storage for
-- Obsidian-synced notes (task 057-059 territory; the actual sync client
-- (lib/vaultSync.ts, task 059) needs iCloud file access and is NOT built
-- this session — device-gated, same reasoning as other device-only features
-- this session. The table exists now so that work has somewhere to write.
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vault_files (
  id           TEXT        PRIMARY KEY,
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path         TEXT        NOT NULL,
  content      TEXT        NOT NULL DEFAULT '',
  content_hash TEXT,
  source       TEXT        NOT NULL DEFAULT 'app' CHECK (source IN ('app', 'user')),
  deleted_at   TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  synced_at    TIMESTAMPTZ
);
ALTER TABLE vault_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own vault files" ON vault_files;
CREATE POLICY "own vault files" ON vault_files FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vault_files_user_path ON vault_files (user_id, path);

-- GIN FTS index for search_vault (task 060) — not built yet, but the index
-- costs nothing to have ready.
CREATE INDEX IF NOT EXISTS idx_vault_files_content_fts
  ON vault_files USING GIN (to_tsvector('english', content));
