# Task 025: Reconcile Gym page with spec

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 005,023

## Goal
Extend existing gym.tsx/workouts.tsx/workout-detail.tsx to cover: PPL day planner UI (the `gym_plan` table itself was already created by tasks/005's migration 003 — this task is UI only, no new migration), rest/cheat day markers. Build on the reconciled schema from task 005 — do not introduce a parallel workouts table; `workout_done_log` already covers it (extended with duration/HR/GPS/calories/notes columns in migration 003).

## Key files
app/(tabs)/gym.tsx — no new migration needed, `gym_plan` already exists

## Acceptance criteria
- [ ] Day planner UI reads/writes the existing `gym_plan` row, one column per weekday
- [ ] Existing PB tracker (pb_log) untouched — it already has `reps` from migration 003
- [ ] Logging a session writes to `workout_done_log` (extended columns) through postWrite('workout', record), not a new `workouts` table

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
