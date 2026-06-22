# Task 002: Migration folder + consolidate loose SQL

**Phase:** 0 — Foundation
**Status:** pending
**Depends on:** 001

## Goal
Create supabase/migrations/ with numbered files. Fold existing run-this-once.sql, workout-schema.sql, user_focus.sql, user_focus_durations.sql, task_schedule_columns.sql into migration 001 (as-is, no schema changes yet) so future migrations have a real base to build on.

## Key files
supabase/migrations/001_baseline.sql

## Acceptance criteria
- [ ] supabase/migrations/ exists with 001_baseline.sql containing the union of existing loose SQL
- [ ] Running it against a fresh Supabase project reproduces current schema
- [ ] Old loose .sql files left in place but marked superseded in a comment

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
