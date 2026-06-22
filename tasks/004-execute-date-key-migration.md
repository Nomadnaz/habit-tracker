# Task 004: Execute date-key migration

**Phase:** 0 — Foundation
**Status:** DONE (code + migration written; SQL migration 002 not yet executed against live Supabase — see below)
**Depends on:** 003

## Goal
Apply the plan from task 003: switch every date-key generation/parsing call site to the canonical zero-padded YYYY-MM-DD format, migrate existing stored values, update CLAUDE.md note already corrected in task 001.

## What was actually done
**Deviation from the plan's mention of date-fns:** implemented `lib/dateKey.ts` (`toDateKey`/`fromDateKey`) with plain `Date` math instead of adding the date-fns dependency — `package.json` already had unrelated uncommitted changes pending, and the canonical requirement is the *output format*, not the library. Manual padding produces an identical result with zero new dependencies.

**A 6th call site was found during execution, missed by task 003's inventory:** `app/calendar/index.tsx` had its own local `dateKey(year, month, day)` — also fixed.

Code changes:
- `lib/dateKey.ts` — new canonical `toDateKey`/`fromDateKey`
- `lib/body-data.ts`, `lib/apple-sync.ts`, `lib/task-schedule.ts`, `lib/workout-data.ts`, `app/calendar/index.tsx`, `app/(tabs)/index.tsx` — all 6 inline implementations now delegate to `lib/dateKey.ts`
- `lib/migrateDateKeysV2.ts` — one-time AsyncStorage migration (`@tasks`, `@body` stepsHistory/trainingHistory, `@wk_done`, `@wk_pbs`), guarded by an AsyncStorage flag
- `app/_layout.tsx` — runs the migration on boot, holds the splash screen and the auth-redirect effect until it finishes, so no screen can read pre-migration keys
- `supabase/migrations/002_date_key_format.sql` — rewrites `tasks.date`, `workout_done_log.date`, `pb_log.date`. **Not yet executed against the live Supabase project** (no DB credentials/CLI in this session) — run it manually, exactly once (it is NOT safely re-runnable, see the warning in the file itself)

## Key files
lib/dateKey.ts, lib/migrateDateKeysV2.ts, lib/body-data.ts, lib/apple-sync.ts, lib/task-schedule.ts, lib/workout-data.ts, app/calendar/index.tsx, app/(tabs)/index.tsx, app/_layout.tsx, supabase/migrations/002_date_key_format.sql

## Acceptance criteria
- [x] All date keys are zero-padded ISO YYYY-MM-DD, 1-indexed months (verified: grepped for the old inline pattern across the codebase, zero remaining hits)
- [x] Existing AsyncStorage/Supabase data migrated, not just new writes (AsyncStorage: code written and wired into boot; Supabase: SQL written, **needs to be run manually against the live project** — do this before relying on existing rows)
- [~] Today screen, calendar, steps, workouts still render correctly after migration — verified via `tsc --noEmit` (0 new errors vs. a 28-error pre-existing baseline) and manual trace of every call site; **no on-device/simulator run was possible in this session** (no web support configured, no simulator attached) — verify on-device before considering this fully closed.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
