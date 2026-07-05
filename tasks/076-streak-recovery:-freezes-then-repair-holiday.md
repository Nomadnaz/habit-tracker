# Task 076: Streak recovery: freezes then repair/holiday

**Phase:** 8 — Polish
**Status:** implemented (2026-07-05) — pending live migration run + on-device verify
**Depends on:** 015

## Goal
MVP: streak freezes only (2/month free, shown as a blue heatmap day, push on use). FUTURE (separate sub-task, do not build until freezes are solid): repair tokens and holiday mode.

## Key files
lib/habits-data.ts (extended, NOT lib/streaks.ts — see notes), migration 022_streak_freezes.sql (new)

## Acceptance criteria
- [x] Freezes auto-apply only when the user enabled auto-freeze for that habit — `computeFrozenDates()` returns an empty set immediately if `habit.autoFreezeEnabled` is false; new per-habit toggle in `app/(tabs)/habits.tsx` ("Auto-freeze on/off (2/month)").
- [x] Repair tokens and holiday mode remain unbuilt / flagged off — untouched; `streak_data`'s `holiday_mode_active`/`repairs_used_this_year` columns (already in migration 009) stay unused.
- [ ] "push on use" — **not implemented**, no notification infra exists (same gap noted for task 063's badges).

## Notes (2026-07-05)
- Extended `lib/habits-data.ts`, not `lib/streaks.ts` — per-habit streak/heatmap logic already lives in `habits-data.ts` (habits deliberately don't use the generic entity-keyed `lib/streaks.ts` cache; see tasks/023's notes for why). Adding freeze logic to the wrong file would have fragmented the source of truth.
- `computeFrozenDates()` walks chronologically (oldest→newest) from the habit's creation date so the 2/month cap is applied in the order freezes would actually have been consumed, resetting the counter on each calendar-month boundary. `computeStreakWithFreezes()` reuses the existing `computeStreak()` by feeding it synthetic "completed" entries for frozen dates — no duplicate streak algorithm.
- Freezes are computed on the fly from `habit_logs` + the `auto_freeze_enabled` flag, not pre-recorded as they're "used" — this keeps it purely derived/idempotent (no risk of a freeze being double-counted or drifting from `streak_data`'s cached columns) at the cost of recomputing the walk on every render, which is cheap for a 35-90 day window.
- Migration only adds one column (`habits.auto_freeze_enabled`) — everything else this task needs already existed from migration 009.
- tsc clean. Not run live or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
