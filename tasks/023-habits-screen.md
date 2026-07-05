# Task 023: Habits screen

**Phase:** 2 — Screens
**Status:** implemented (2026-07-05) — pending on-device verify
**Depends on:** 014,022

## Goal
app/(tabs)/habits.tsx: list of active habits, per-habit streak + heatmap (HeatmapCalendar component, new), completion button, add-habit flow. Completion goes through postWrite('habit_log', record).

## Key files
app/(tabs)/habits.tsx, components/HeatmapCalendar.tsx

## Acceptance criteria
- [x] Habit completion updates cumulative_stats and streak via postWrite, never touches them directly
- [x] Heatmap renders green/red/grey at minimum (freeze/holiday/repair colours arrive with task 074)

## Notes (2026-07-05)
- Entity is `'habit'` not `'habit_log'` — matches the existing `Entity` union already in `lib/postWrite.ts` (`task | workout | habit | water | weight | sleep | meal`); adding a second string for the same domain would just fork the type for no benefit.
- Per-habit streak (current/longest) is computed from `habit_logs` (the source of truth) in `lib/habits-data.ts`, not from the generic `lib/streaks.ts` AsyncStorage cache — that cache holds one counter per entity *type*, which breaks once a user has more than one habit. `computeStreak()`/`buildHeatmap()` read the full log directly and cache the result into the new `streak_data` table. `postWrite('habit', …)` still fires for the shared cumulative_stats/badge fan-out.
- New tab added: `app/(tabs)/habits.tsx`, registered in `app/(tabs)/_layout.tsx` between Today and Body (incremental per current-state.md's tab-restructuring note — the other four tabs untouched).
- tsc clean for all new/changed files (pre-existing unrelated errors elsewhere unchanged). Not verified on-device this session (no simulator available) — next: open the app, add a habit, mark it done, confirm the heatmap cell turns green and the streak count persists across app restart.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
