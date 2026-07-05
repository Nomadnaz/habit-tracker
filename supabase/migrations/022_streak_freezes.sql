-- ═══════════════════════════════════════════════════════════════════════════
-- 022_streak_freezes.sql  —  Streak freezes, MVP only (task 076)
--
-- Adds the one column freeze auto-apply needs: habits.auto_freeze_enabled.
-- Everything else (freezes_used_this_month, streak_events 'freeze' type)
-- already exists from migration 009_habits.sql. Repair tokens and holiday
-- mode are explicitly a SEPARATE future sub-task per this task's own text
-- — "do not build until freezes are solid" — so nothing else changes here.
--
-- Idempotent — safe to re-run.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE habits ADD COLUMN IF NOT EXISTS auto_freeze_enabled BOOLEAN NOT NULL DEFAULT FALSE;
