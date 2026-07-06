# Task 039: Internal action execution wiring

**Phase:** 3 — Wire AI to Data
**Status:** partially implemented (2026-06-29) — tasks/create_task/reschedule_task/complete_task + log_pb wired; log_workout/change_gym_plan_day/log_meal pending their domains
**Depends on:** 012,038

## Goal
Wire log_workout, change_gym_plan_day, log_meal, create_task actions in actionExecutor.ts to real Supabase writes, each going through postWrite where applicable.

## Key files
supabase/functions/_shared/actionExecutor.ts

## Acceptance criteria
- [x] Each action has a confidence-gated path: >0.85 executes immediately, 0.6-0.85 shows PreviewCard, <0.6 asks for clarification (`gateAction`/`processActions`).
- [x] Executed actions that create domain records call postWrite, not raw inserts — client `lib/actionExecutor.ts` routes every confirmed/executed write through `postWrite`. (Server-side execution does raw scoped writes because `postWrite` is a client-only lib with AsyncStorage/Haptics deps; the app fans out `postWrite` on receipt via `fanOutExecuted()`. The voice-device path has no client, so its writes land but skip local fan-out — acceptable.)

## Notes (2026-06-29)
- Wired: `create_task`, `reschedule_task`, `complete_task` (tasks domain, live), `log_pb` (gym, live).
- Pending their domains: `log_workout`, `change_gym_plan_day`, `log_meal` → currently return `status: 'unsupported'` until those write paths/tables are confirmed (tasks 031/035 etc.). Add their executors alongside the existing four when ready.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
