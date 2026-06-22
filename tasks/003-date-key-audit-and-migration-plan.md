# Task 003: Date-key audit and migration plan

**Phase:** 0 — Foundation
**Status:** pending
**Depends on:** 001

## Goal
Audit every AsyncStorage key and Supabase date column using the OLD format (YYYY-M-D, 0-indexed month) and produce a migration plan to the canonical YYYY-MM-DD (1-indexed, zero-padded, local timezone). Do not change code yet in this task — just produce the inventory.

## Key files
lib/tasks-core.ts, lib/task-schedule.ts, lib/task-supabase.ts, lib/steps-data.ts, lib/body-data.ts, lib/workout-data.ts

## Acceptance criteria
- [ ] Written inventory of every call site using the old date format
- [ ] Plan for a one-time data migration (rewrite existing AsyncStorage/Supabase date strings) vs a flag-day cutover
- [ ] No code changed yet — this is the plan task, execution is task 004

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
