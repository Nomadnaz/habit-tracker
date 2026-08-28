# Migration ledger

> Tracks which migrations have actually been run against the live Supabase
> project. This file is the source of truth for that — not prose scattered
> across current-state.md's progress log. **Update this the moment you run
> a migration in the SQL editor**, before moving on.
>
> Why this exists: an architecture audit (2026-07-06) found there was no
> record anywhere of which migrations had executed against production
> except free-text notes in current-state.md, and `002_date_key_format.sql`
> is a one-time, NOT-safely-re-runnable migration with no other guard
> against being pasted twice. `supabase db push` must NEVER be run on this
> project (see CLAUDE.md) — it would re-run 002 against live data.

| Migration | Applied? | Date | Notes |
|---|---|---|---|
| 001_baseline.sql | ✅ yes | pre-2026-06-22 | Baseline schema, matches `run-this-once.sql` |
| 002_date_key_format.sql | ✅ yes | pre-2026-07-06 | Confirmed via Supabase migration history (`supabase_migrations.schema_migrations`) — do NOT re-run. |
| 003_gym_body_reconcile.sql | ✅ yes | pre-2026-07-06 | Confirmed via Supabase migration history. |
| 006_ai_companions.sql | ✅ yes | 2026-06-29 | Live — `ai-chat` depends on these tables |
| 007_nutrition.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 008_realtime_tasks.sql | ✅ yes | 2026-06-29 | Live — Realtime enabled on `tasks` |
| 009_habits.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session. **Blocked on a pre-existing incompatible `habits`/`habit_logs` schema from an old prototype — see "legacy table cleanup" below.** |
| 010_medications.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 011_sleep.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 012_activity.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 013_user_profiles.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 014_user_api_keys.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 015_badges.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 016_cumulative_stats.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 017_goals.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 018_finance.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 019_mental_health.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 020_cycle.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 021_library.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 022_streak_freezes.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 023_vault_files.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session |
| 024_api_usage_increment.sql | ✅ yes | 2026-07-06 | Applied via Supabase MCP this session. Also hardened post-apply (see below) — the audit that wrote this migration didn't lock down the new RPCs' grants. |
| 025_meal_photo_storage.sql | ✅ yes | 2026-07-08 | Was already live (confirmed via `list_migrations` + `meal-photos` bucket present); this ledger just hadn't been updated for it. |
| 026_focus_sessions.sql | ✅ yes | 2026-07-08 | Applied via Supabase MCP. `focus_sessions` table confirmed live. |
| 027_vault_inbox.sql | ✅ yes | 2026-07-08 | Applied via Supabase MCP. `vault_inbox` table confirmed live. |
| 028_firmware_storage.sql | ✅ yes | 2026-07-08 | Applied via Supabase MCP (public `firmware` bucket for OTA — user explicitly confirmed the public-bucket tradeoff). Bucket confirmed live via `storage.buckets`. |

| 029_daily_steps.sql | ✅ yes | 2026-08-04 (approx) | Confirmed live per current-state.md ("Migrations — all 29 live"); this ledger just hadn't been updated for it. |
| 030_exercise_sets.sql | ⬜ NOT YET RUN | — | New table for the rep-sensor pivot (handover-8, element 2) — `exercise_sets` + estimated-1RM PB detection. Paste into the SQL editor, then flip this row and re-run `_shared/actionExecutor.ts`'s callers (redeploy `ai-chat` + `device-log`, both import it) — until then `log_pb`/`log_set` will 500 on the missing table. |

All 29 numbered migrations through `029` are live. `030` is drafted, not yet applied — see row above.

## Legacy table cleanup (2026-07-06)
Before running `009_habits.sql`, discovered the live DB already had `habits`, `habit_logs`, `profiles`,
and `bonsai` tables from an earlier, pre-system-model.md prototype — none referenced in `database.md`,
none matching the current app code's expected columns (old `habits` used a UUID PK + `category`/`icon`/
`is_active`/`requires_geo` columns; current code expects a TEXT PK + `frequency`/`reminder_time`/`active`).
`bonsai` appears to be the dead "Tree" tab (`current-state.md` lists `app/(tabs)/tree.tsx` as a 16-line
stub). All four were empty (0 rows) — dropped with user confirmation rather than left to silently
no-op `CREATE TABLE IF NOT EXISTS` and break the Habits screen at runtime.

## Post-apply hardening (2026-07-06)
`024_api_usage_increment.sql`'s two new RPCs (`increment_api_usage`, `increment_briefing_usage`) were
`SECURITY DEFINER` with no grant restriction — callable by `anon`/`authenticated` via the REST RPC
endpoint with an arbitrary `p_user_id`, letting anyone tamper with another user's token/rate-limit
accounting. Fixed post-apply: pinned `search_path`, revoked EXECUTE from `PUBLIC`/`anon`/`authenticated`,
granted only to `service_role` (the role `ai-chat`/`daily-briefing` actually call with). Not written as
a numbered migration file since it's a grant-only correction to `024`, not new schema — noted here.
