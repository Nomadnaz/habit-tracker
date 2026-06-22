# Task 015: lib/streaks.ts + unit tests

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 014

## Goal
Pure streak calculation logic: current streak, longest streak, local-timezone-only date math, freeze handling hook (freezes wired in task 074). This is the highest-risk-for-silent-bugs module in the app.

## Key files
lib/streaks.ts, lib/__tests__/streaks.test.ts

## Acceptance criteria
- [ ] Pure functions, no I/O
- [ ] Unit tests cover: midnight rollover, DST transition, missed day, freeze applied, month/year boundary
- [ ] vitest passes

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
