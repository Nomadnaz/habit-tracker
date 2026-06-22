# Task 014: lib/postWrite.ts fan-out

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006,008

## Goal
The single fan-out function every screen calls after a write: increment cumulative_stats (live), update streak via lib/streaks.ts (live), badge check / friend-feed / Obsidian write (flagged no-ops behind featureFlags). Uses Promise.allSettled.

## Key files
lib/postWrite.ts

## Acceptance criteria
- [ ] Exactly one exported postWrite(entity, record) function
- [ ] Steps 3-5 are real functions that early-return when their flag is off — not missing
- [ ] A failing side effect never throws or blocks the caller

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
