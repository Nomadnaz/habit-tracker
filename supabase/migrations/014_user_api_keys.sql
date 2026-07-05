-- ═══════════════════════════════════════════════════════════════════════════
-- 014_user_api_keys.sql  —  BYOK storage for the Settings API-key toggle (task 020)
--
-- Stores ONLY ciphertext (AES-256-GCM, encrypted server-side by the
-- save-api-key Edge Function using a secret that never reaches the client
-- or this table's RLS-readable rows in plaintext). The client never
-- decrypts this — it only ever asks the function "do I have a key saved?"
-- (see supabase/functions/save-api-key/index.ts).
--
-- Every table: user_id + RLS `user_id = auth.uid()` (canonical rule, database.md).
-- Idempotent (CREATE ... IF NOT EXISTS / DROP POLICY IF EXISTS) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ciphertext_b64 TEXT        NOT NULL,
  iv_b64         TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own api key" ON user_api_keys;
CREATE POLICY "own api key" ON user_api_keys FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
