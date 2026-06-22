# Task 029: Calorie page (manual logging)

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 028

## Goal
New tab or nested-under-body screen: daily calorie/macro progress bars, meal log by day, manual logging form, quick-add from recent meals.

## Key files
app/(tabs)/calorie.tsx or app/(tabs)/body.tsx (nested tab — decide and document in database.md)

## Acceptance criteria
- [ ] Manual logging works end-to-end before any photo/AI logging is attempted
- [ ] Logging a meal goes through postWrite('meal', record)
- [ ] Progress bars compare against nutrition_targets

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
