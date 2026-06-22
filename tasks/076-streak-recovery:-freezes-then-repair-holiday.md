# Task 076: Streak recovery: freezes then repair/holiday

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 015

## Goal
MVP: streak freezes only (2/month free, shown as a blue heatmap day, push on use). FUTURE (separate sub-task, do not build until freezes are solid): repair tokens and holiday mode.

## Key files
lib/streaks.ts (extended)

## Acceptance criteria
- [ ] Freezes auto-apply only when the user enabled auto-freeze for that habit
- [ ] Repair tokens and holiday mode remain unbuilt / flagged off until freezes have shipped and been used in practice

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
