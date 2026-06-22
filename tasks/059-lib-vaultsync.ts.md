# Task 059: lib/vaultSync.ts

**Phase:** 7 — Obsidian Sync
**Status:** pending
**Depends on:** 057,058

## Goal
One-directional sync: app-owned files (DB authoritative, restores over edits) vs user-owned files (device uploads hand-written content, AI never overwrites). Runs on app open + expo-background-fetch.

## Key files
lib/vaultSync.ts

## Acceptance criteria
- [ ] Hash comparison used so only changed files move
- [ ] A user-owned file's content is never overwritten by the app
- [ ] Deleted user files get deleted_at, not a hard delete

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
