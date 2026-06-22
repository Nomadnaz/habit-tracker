# Task 037: Extend buildContext contextSources for live domains

**Phase:** 3 — Wire AI to Data
**Status:** pending
**Depends on:** 010,023,025,029,032,034,036

## Goal
Wire each of habitCoach/gym/calorie/activity/sleep companion contextSources to the real tables built in Phase 2 (previously these were config entries pointing at empty tables).

## Key files
supabase/functions/_shared/buildContext.ts

## Acceptance criteria
- [ ] Each of the 5 companions returns real context (not empty arrays) when queried for a user with logged data
- [ ] Query performance acceptable for a single user's full history (add basic limits/windowing if needed)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
