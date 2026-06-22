# Task 005: Schema reconciliation: gym/body domains

**Phase:** 0 — Foundation
**Status:** DONE (draft migration written; not yet executed against the live Supabase project)
**Depends on:** 002

## Goal
The existing app already has workout_templates, workout_exercises, workout_done_log, pb_log, exercises, body_weight_logs, water_logs — a different schema than the spec's workouts/personal_bests/gym_plan/body_logs. Decide and document: extend existing tables to cover spec features, or introduce spec tables alongside and bridge. Do not write code — this is the decision + migration draft.

## Decision
Extend the existing tables additively; do not introduce parallel spec-named tables. Full rationale and the concrete mapping table are in `database.md`. Migration file is numbered **003** (not 002 — migration 002 was taken by tasks/004's date-key fix, written after this task was originally scoped).

## Key files
database.md (updated with the final decision + mapping table), supabase/migrations/003_gym_body_reconcile.sql (draft)

## Acceptance criteria
- [x] Decision documented in database.md with rationale
- [x] Draft migration written (additive columns/tables only, no destructive renames) — `supabase/migrations/003_gym_body_reconcile.sql`
- [x] Existing gym.tsx / workouts.tsx / workout-detail.tsx continue to function unmodified by this task (verified: no .tsx/.ts files touched, SQL-only)

## Follow-up
Migration 003 is a **draft**, not yet run against the live Supabase project (no DB credentials in this session). Run it manually once ready; it's purely additive (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) so it's safe to re-run.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
