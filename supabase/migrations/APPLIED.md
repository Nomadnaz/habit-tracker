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
| 002_date_key_format.sql | ❓ unconfirmed | — | ⚠️ NOT safely re-runnable. Confirm before running again. |
| 003_gym_body_reconcile.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 006_ai_companions.sql | ✅ yes | 2026-06-29 | Live — `ai-chat` depends on these tables |
| 007_nutrition.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 008_realtime_tasks.sql | ✅ yes | 2026-06-29 | Live — Realtime enabled on `tasks` |
| 009_habits.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 010_medications.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 011_sleep.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 012_activity.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 013_user_profiles.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 014_user_api_keys.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 015_badges.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 016_cumulative_stats.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 017_goals.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 018_finance.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 019_mental_health.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 020_cycle.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 021_library.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 022_streak_freezes.sql | ❓ unconfirmed | — | Safe to re-run (additive) |
| 023_vault_files.sql | ❓ unconfirmed | — | Safe to re-run (additive) |

"✅ yes" entries are taken from current-state.md's progress log (the only prior record). "❓ unconfirmed" means: written and committed, but no session has confirmed it was actually pasted into the SQL editor. Flip to ✅ with a date the moment you run one.
