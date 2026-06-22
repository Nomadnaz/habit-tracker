# Task 023: Habits screen

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 014,022

## Goal
app/(tabs)/habits.tsx: list of active habits, per-habit streak + heatmap (HeatmapCalendar component, new), completion button, add-habit flow. Completion goes through postWrite('habit_log', record).

## Key files
app/(tabs)/habits.tsx, components/HeatmapCalendar.tsx

## Acceptance criteria
- [ ] Habit completion updates cumulative_stats and streak via postWrite, never touches them directly
- [ ] Heatmap renders green/red/grey at minimum (freeze/holiday/repair colours arrive with task 074)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
