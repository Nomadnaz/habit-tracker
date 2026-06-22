# Task 004: Execute date-key migration

**Phase:** 0 — Foundation
**Status:** pending
**Depends on:** 003

## Goal
Apply the plan from task 003: switch every date-key generation/parsing call site to date-fns format(date, 'yyyy-MM-dd'), migrate existing stored values, update CLAUDE.md note already corrected in task 001.

## Key files
lib/tasks-core.ts, lib/task-schedule.ts, lib/task-supabase.ts, lib/steps-data.ts, lib/body-data.ts, lib/workout-data.ts

## Acceptance criteria
- [ ] All date keys are zero-padded ISO YYYY-MM-DD, 1-indexed months
- [ ] Existing AsyncStorage/Supabase data migrated, not just new writes
- [ ] Today screen, calendar, steps, workouts still render correctly after migration

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
