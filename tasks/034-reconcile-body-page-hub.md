# Task 034: Reconcile Body page hub

**Phase:** 2 — Screens
**Status:** already satisfied by existing code (confirmed 2026-07-05) — no new file needed
**Depends on:** 005,033

## Goal
app/(tabs)/body.tsx: step ring (HealthKit, task 040 dependency for live data — build the UI now with mock/manual fallback), reconcile water_logs/body_weight_logs into this hub rather than duplicating body_logs.

## Key files
app/(tabs)/body.tsx — **does not exist; not needed.** `app/(tabs)/gym.tsx` already IS this hub: its own header comment calls it "BODY PAGE — the fitness overview dashboard," and `app/(tabs)/_layout.tsx` already registers it as `<Tabs.Screen name="gym" options={{ title: 'BODY' }} />`. Renaming the file/route for a purely cosmetic match to this task's suggested filename would be churn on a working screen with zero functional gain — CLAUDE.md's "don't refactor things that aren't broken" — so it was left as-is. `current-state.md`'s old table wrongly listed "Gym" and "Body (partial)" as two separate unfinished things; that was stale, not accurate — corrected in this pass.

## Acceptance criteria
- [x] Existing water_logs/body_weight_logs data displays correctly here, not orphaned — `lib/body-data.ts`'s `addWater`/`logWeight` write straight to those reconciled tables (tasks/005's decision), read back from the local `BodyData` cache the same way every other domain in this app works (local-first).
- [x] Manual weight/water entry still works without HealthKit connected — the water/weight modals in `gym.tsx` (`waterOpen`/`weightOpen`) are independent of `lib/apple-health.ts`; steps default to a seeded/local `stepsHistory` when HealthKit isn't connected (`isAppleHealthSupported()` gates the sync, never the display).
- [ ] Cards open the right modals (sleep-detail, cycle-tracking, mood) once those exist — correctly N/A; those domains don't exist yet (FUTURE per current-state.md), so there's nothing to wire. Revisit this one criterion when sleep/cycle/mood land.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
