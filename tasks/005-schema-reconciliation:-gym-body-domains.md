# Task 005: Schema reconciliation: gym/body domains

**Phase:** 0 — Foundation
**Status:** pending
**Depends on:** 002

## Goal
The existing app already has workout_templates, workout_exercises, workout_done_log, pb_log, exercises, body_weight_logs, water_logs — a different schema than the spec's workouts/personal_bests/gym_plan/body_logs. Decide and document: extend existing tables to cover spec features, or introduce spec tables alongside and bridge. Do not write code — this is the decision + migration-002 draft.

## Key files
database.md, supabase/migrations/002_gym_body_reconcile.sql (draft)

## Acceptance criteria
- [ ] Decision documented in database.md with rationale
- [ ] Draft migration 002 written (additive columns/tables only, no destructive renames without a follow-up data migration)
- [ ] Existing gym.tsx / workouts.tsx / workout-detail.tsx continue to function unmodified by this task

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
