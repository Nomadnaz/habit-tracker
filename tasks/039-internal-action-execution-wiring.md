# Task 039: Internal action execution wiring

**Phase:** 3 — Wire AI to Data
**Status:** pending
**Depends on:** 012,038

## Goal
Wire log_workout, change_gym_plan_day, log_meal, create_task actions in actionExecutor.ts to real Supabase writes, each going through postWrite where applicable.

## Key files
supabase/functions/_shared/actionExecutor.ts

## Acceptance criteria
- [ ] Each action has a confidence-gated path: >0.85 executes immediately, 0.6-0.85 shows PreviewCard, <0.6 asks for clarification
- [ ] Executed actions that create domain records call postWrite, not raw inserts

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
