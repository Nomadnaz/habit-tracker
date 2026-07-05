# Task 024: Medication & Supplements sub-section

**Phase:** 2 — Screens
**Status:** implemented (2026-07-05) — pending on-device verify
**Depends on:** 023

## Goal
A card/toggle inside habits.tsx (not a separate tab): per-medication heatmap, streak, adherence %, course progress bar. Migration for medications, medication_logs.

## Key files
supabase/migrations/010_medications.sql (next free number was 010, not the task file's hardcoded 005), app/(tabs)/habits.tsx (extended), lib/medications-data.ts (new)

## Acceptance criteria
- [x] Adherence % calculated over trailing 30 days
- [x] Course progress shows 'Day X of Y' when course_length is set
- [x] Logging a dose goes through postWrite (entity `'medication'`, added to the `Entity` union in `lib/postWrite.ts` — same pattern as `'meal'` in tasks/028)

## Notes (2026-07-05)
- `lib/medications-data.ts` mirrors `lib/habits-data.ts`: local-first AsyncStorage + fire-and-forget Supabase, streak/heatmap computed from `medication_logs` directly.
- Generalized `computeStreak()` in `lib/habits-data.ts` to take `{date, completed}[]` instead of `HabitLog[]` specifically, so medications' `{date, taken}` logs can reuse it via a thin `computeMedStreak()` wrapper — avoided duplicating the streak-run algorithm.
- `app/(tabs)/habits.tsx` gained a HABITS/MEDICATION segmented toggle at the top (not a new tab, per this task's spec) and a second add-flow modal (name, medication/supplement type, optional course length in days).
- `cycle_linked`/`cycle_day` columns exist in the migration (matching database.md's canonical schema) but nothing reads/writes them — Cycle (task 067) is FUTURE and opt-in.
- tsc clean for all new/changed files. Not verified on-device this session (no simulator available).

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
