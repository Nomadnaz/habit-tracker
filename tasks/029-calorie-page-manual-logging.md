# Task 029: Calorie page (manual logging)

**Phase:** 2 — Screens
**Status:** DONE — built as a standalone `app/calorie.tsx` reachable from the Today header (no new tab, per user choice)
**Depends on:** 028

## Goal
New tab or nested-under-body screen: daily calorie/macro progress bars, meal log by day, manual logging form, quick-add from recent meals.

## Key files
app/(tabs)/calorie.tsx or app/(tabs)/body.tsx (nested tab — decide and document in database.md)

## Acceptance criteria
- [x] Manual logging works end-to-end before any photo/AI logging is attempted (`lib/meals-data.ts` is local-first; works offline with no backend)
- [x] Logging a meal goes through postWrite('meal', record) (Entity union extended with 'meal')
- [x] Progress bars compare against nutrition_targets (`getTargets` + `ProgressBar` in `app/calorie.tsx`)

**Decision (per task's "decide and document"):** standalone `app/calorie.tsx` route opened from the Today-screen header apple icon, NOT a tab — the user chose "reachable from Today/Body, no new tab."

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
