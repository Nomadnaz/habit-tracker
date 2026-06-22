# Task 002: Migration folder + consolidate loose SQL

**Phase:** 0 — Foundation
**Status:** DONE
**Depends on:** 001

## Goal
Create supabase/migrations/ with numbered files. Fold existing run-this-once.sql, workout-schema.sql, user_focus.sql, user_focus_durations.sql, task_schedule_columns.sql into migration 001 (as-is, no schema changes yet) so future migrations have a real base to build on.

## Key files
supabase/migrations/001_baseline.sql

## Acceptance criteria
- [x] supabase/migrations/ exists with 001_baseline.sql containing the union of existing loose SQL
- [x] Running it against a fresh Supabase project reproduces current schema (verified by cross-referencing against actual `lib/workout-data.ts` table usage, not by executing live — no Supabase CLI/MCP access in this session; run it manually in the SQL editor to apply)
- [x] Old loose .sql files left in place but marked superseded in a comment

## Finding worth flagging
`run-this-once.sql` and `workout-schema.sql` defined **conflicting** schemas for `workout_templates`/`exercises` (TEXT-keyed `muscle_groups[]` vs UUID-keyed `muscle_group` singular). Confirmed via grep that `lib/workout-data.ts` only ever uses the `run-this-once.sql` shape — `workout-schema.sql` and its three extra tables (`workout_sessions`, `session_sets`, `user_goals`) are dead, never wired up anywhere. `001_baseline.sql` is built from the live shape only; `workout-schema.sql` is marked dead, not folded in.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
