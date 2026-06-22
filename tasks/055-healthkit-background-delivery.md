# Task 055: HealthKit background delivery

**Phase:** 6 — Native Modules
**Status:** pending
**Depends on:** 042

## Goal
Upgrade task 042 from foreground reads to background delivery so steps/sleep update without opening the app.

## Key files
lib/healthkit.ts (extended)

## Acceptance criteria
- [ ] Background delivery confirmed working over a multi-hour test, not just immediately after granting permission

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
