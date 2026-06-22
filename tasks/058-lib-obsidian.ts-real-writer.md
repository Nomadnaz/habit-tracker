# Task 058: lib/obsidian.ts real writer

**Phase:** 7 — Obsidian Sync
**Status:** pending
**Depends on:** 014,056

## Goal
Flip postWrite step 5 from a no-op to a real markdown writer per the spec's file structure (Daily Notes/, Library/, Workouts/, Habits/, Goals/, Recycle-Bin/).

## Key files
lib/obsidian.ts

## Acceptance criteria
- [ ] Deleting an item moves its file to Recycle-Bin/ with a deleted_at header, never hard-deletes
- [ ] Front-matter format matches the spec's example exactly for at least books and daily notes

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
