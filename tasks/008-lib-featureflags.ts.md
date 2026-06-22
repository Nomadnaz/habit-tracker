# Task 008: lib/featureFlags.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** none

## Goal
All non-MVP features default to false: badges, social, obsidianSync, cycle, mood journal/therapy, finance, library, travel, accountability, appBlocking, wearables beyond HealthKit.

## Key files
lib/featureFlags.ts

## Acceptance criteria
- [ ] Every FUTURE-tagged spec feature has a corresponding flag defaulted false
- [ ] postWrite's no-op steps (badge/friend-feed/obsidian) read these flags

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
