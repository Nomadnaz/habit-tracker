# Task 075: Offline sync queue hardening

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** none

## Goal
The local-first architecture already gives most offline behaviour for free — this task hardens the sync queue: chronological replay on reconnect, most-recent-timestamp conflict resolution, the offline banner, and the simplified 'reply waits for next app open' AI behaviour (no push-reply path).

## Key files
lib/syncQueue.ts

## Acceptance criteria
- [ ] Actions taken offline replay in the order they were made, not an arbitrary order
- [ ] AI messages sent offline are queued and answered on next app open, no push-reply path built

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
