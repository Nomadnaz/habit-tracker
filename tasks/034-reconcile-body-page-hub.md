# Task 034: Reconcile Body page hub

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 005,033

## Goal
app/(tabs)/body.tsx: step ring (HealthKit, task 040 dependency for live data — build the UI now with mock/manual fallback), reconcile water_logs/body_weight_logs into this hub rather than duplicating body_logs.

## Key files
app/(tabs)/body.tsx

## Acceptance criteria
- [ ] Existing water_logs/body_weight_logs data displays correctly here, not orphaned
- [ ] Manual weight/water entry still works without HealthKit connected
- [ ] Cards open the right modals (sleep-detail, cycle-tracking, mood) once those exist

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
