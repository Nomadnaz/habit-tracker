# Task 025: Reconcile Gym page with spec

**Phase:** 2 — Screens
**Status:** implemented (2026-07-05) — pending on-device verify
**Depends on:** 005,023

## Goal
Extend existing gym.tsx/workouts.tsx/workout-detail.tsx to cover: PPL day planner UI (the `gym_plan` table itself was already created by tasks/005's migration 003 — this task is UI only, no new migration), rest/cheat day markers. Build on the reconciled schema from task 005 — do not introduce a parallel workouts table; `workout_done_log` already covers it (extended with duration/HR/GPS/calories/notes columns in migration 003).

## Key files
app/(tabs)/gym.tsx, lib/workout-data.ts (extended) — no new migration needed, `gym_plan` already exists

## Acceptance criteria
- [x] Day planner UI reads/writes the existing `gym_plan` row, one column per weekday — new `getGymPlan()`/`setGymPlanDay()` in `lib/workout-data.ts`, a 7-chip WEEK PLAN row in `gym.tsx` (tap a day to cycle push→pull→legs→upper→lower→rest→cheat→cleared).
- [x] Existing PB tracker (pb_log) untouched — not modified.
- [x] Logging a session writes to `workout_done_log` through postWrite('workout', record) — **found and fixed a real gap**: `markDoneToday()` had never called `postWrite` at all since it was written; it wrote straight to `workout_done_log` with zero fan-out (no cumulative_stats, no badge checks). Now calls `postWrite('workout', { template_id, date }, ...)`.

## Notes (2026-07-05)
'rest'/'cheat' are plain string values in the same TEXT columns `gym_plan` already had — no schema change, matches the migration 003 comment's own note that session_type is just a string. Fixing the missing `postWrite` call also means `first_workout`/`workouts_10` badges (task 063) and the `total_gym_sessions` cumulative stat (task 014) now actually fire when a session is logged — before this fix, neither did, despite both being built and "wired" against a call that was never made. tsc clean. Not verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
