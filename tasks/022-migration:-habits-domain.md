# Task 022: Migration: habits domain

**Phase:** 2 — Screens
**Status:** written (2026-07-05) — pending live run
**Depends on:** 002

## Goal
Add habits, habit_logs, streak_data, streak_events tables.

## Key files
supabase/migrations/009_habits.sql (`004` in this file's original numbering was already taken — see "Migration numbers are hints" in CLAUDE.md; `ls supabase/migrations/` showed `008` as the last one on disk)

## Acceptance criteria
- [x] Migration written, additive/idempotent (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`), safe to re-run
- [x] RLS present on all four tables
- [ ] Run clean against the live Supabase project — **not yet run**, needs a human to paste it into the SQL editor per current-state.md's action-needed list

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
