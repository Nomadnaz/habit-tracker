# Task 042: HealthKit steps + sleep

**Phase:** 5 — Integrations
**Status:** pending
**Depends on:** 034

## Goal
lib/healthkit.ts: read step count and basic sleep via HealthKit permission (not OAuth). Feeds body.tsx step ring and sleep-detail manual-entry fallback.

## Key files
lib/healthkit.ts

## Acceptance criteria
- [ ] Permission requested with a clear rationale string
- [ ] Step ring on body.tsx reflects live HealthKit data once granted
- [ ] Falls back gracefully (manual entry) when permission denied

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
