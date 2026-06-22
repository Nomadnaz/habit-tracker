# Task 024: Medication & Supplements sub-section

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 023

## Goal
A card/toggle inside habits.tsx (not a separate tab): per-medication heatmap, streak, adherence %, course progress bar. Migration for medications, medication_logs.

## Key files
supabase/migrations/005_medications.sql, app/(tabs)/habits.tsx (extended)

## Acceptance criteria
- [ ] Adherence % calculated over trailing 30 days
- [ ] Course progress shows 'Day X of Y' when course_length is set
- [ ] Logging a dose goes through postWrite('medication_log', record)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
