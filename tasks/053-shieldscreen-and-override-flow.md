# Task 053: ShieldScreen + override flow

**Phase:** 6 — Native Modules
**Status:** pending
**Depends on:** 052

## Goal
components/ShieldScreen.tsx: shown when a blocked app opens during an active block. 5-second countdown + 5-minute override, logged to block_sessions.

## Key files
components/ShieldScreen.tsx

## Acceptance criteria
- [ ] Override always logged with timestamp and app token
- [ ] Strict mode (no override) actually removes the override button, not just hides it

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
