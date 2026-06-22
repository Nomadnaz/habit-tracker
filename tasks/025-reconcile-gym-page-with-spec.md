# Task 025: Reconcile Gym page with spec

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 005,023

## Goal
Extend existing gym.tsx/workouts.tsx/workout-detail.tsx to cover: PPL day planner (gym_plan table), rest/cheat day markers. Build on the reconciled schema from task 005 — do not introduce a parallel workouts table if exercises/workout_done_log already cover it.

## Key files
app/(tabs)/gym.tsx, supabase/migrations/006_gym_plan.sql

## Acceptance criteria
- [ ] Day planner persisted per user, one row per weekday
- [ ] Existing PB tracker (pb_log) untouched unless task 005 called for a rename
- [ ] Logging a session goes through postWrite('workout', record)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
