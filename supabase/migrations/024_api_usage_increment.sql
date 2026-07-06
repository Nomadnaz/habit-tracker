-- ═══════════════════════════════════════════════════════════════════════════
-- 024_api_usage_increment.sql  —  atomic api_usage accumulation (audit finding)
--
-- ai-chat/index.ts's api_usage upsert was writing `tokens_in: tokensIn ?? 0`
-- directly — a plain upsert's ON CONFLICT DO UPDATE SET overwrites the
-- column, so each message OVERWROTE the day's running token totals with
-- just that one message's tokens instead of accumulating them. The stated
-- purpose of api_usage (cost visibility, task 013) was broken. This RPC
-- makes the increment atomic and additive: message_count/tokens_in/
-- tokens_out all accumulate via `column = api_usage.column + delta`,
-- callable from Deno via `admin.rpc('increment_api_usage', {...})`.
--
-- Note: the CAP CHECK itself (is message_count >= FREE_DAILY_CAP) still
-- reads before this increment runs, so a burst of concurrent requests from
-- the same user could still slip a few messages past the cap — this fixes
-- the accounting correctness bug, not that separate (lower-severity, cost-
-- bounded) race. Flagging rather than claiming it's fully closed.
--
-- SECURITY DEFINER: runs as the function owner (not the caller), same
-- trust boundary as the existing service-role-only access to this table —
-- ai-chat already calls with the service-role key, which bypasses RLS
-- anyway. Idempotent (CREATE OR REPLACE) — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_api_usage(
  p_user_id uuid,
  p_date text,
  p_message_count int,
  p_tokens_in int,
  p_tokens_out int
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO api_usage (user_id, date, message_count, tokens_in, tokens_out, last_message_at)
  VALUES (p_user_id, p_date, p_message_count, p_tokens_in, p_tokens_out, NOW())
  ON CONFLICT (user_id, date) DO UPDATE SET
    message_count = api_usage.message_count + p_message_count,
    tokens_in = api_usage.tokens_in + p_tokens_in,
    tokens_out = api_usage.tokens_out + p_tokens_out,
    last_message_at = NOW();
$$;

-- ── daily-briefing rate limiting (audit finding) ─────────────────────────────
-- daily-briefing/index.ts had NO rate limit at all: any authed user could
-- loop it, and each call runs buildContext's full query fan-out PLUS a
-- Haiku call on the app's shared key. Reuses the same api_usage row
-- (one per user per day) with its own counter column, so briefing calls
-- and chat messages are tracked/capped independently.
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS briefing_count INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION increment_briefing_usage(
  p_user_id uuid,
  p_date text
) RETURNS int
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO api_usage (user_id, date, briefing_count, last_message_at)
  VALUES (p_user_id, p_date, 1, NOW())
  ON CONFLICT (user_id, date) DO UPDATE SET
    briefing_count = api_usage.briefing_count + 1,
    last_message_at = NOW()
  RETURNING briefing_count;
$$;
