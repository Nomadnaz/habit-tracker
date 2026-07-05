# Task 018: components/BriefingCard.tsx

**Phase:** 1 — Companion Infra
**Status:** implemented (2026-07-05) — pending live redeploy + on-device verify
**Depends on:** none

## Goal
Daily briefing card UI for the today screen: renders briefing text, a refresh/'Get Daily Briefing' button, last-updated time.

## Key files
components/BriefingCard.tsx

## Acceptance criteria
- [x] Loads cached briefing from AsyncStorage instantly — reads `@habittracker_briefing_{date}` on mount, matching task 019's cache key format exactly.
- [x] Manual refresh button calls the daily-briefing function — `supabase.functions.invoke('daily-briefing', ...)`.
- [x] Empty state before first briefing is generated — "No briefing yet today." + a GET DAILY BRIEFING button.

## Notes (2026-07-05)
Mounted on the Today screen (`app/(tabs)/index.tsx`), directly below the header, above the date/task list — a 2-line addition (import + `<BriefingCard />`) to keep the footprint small in an already-large file. tsc clean. Not verified on-device (no simulator); also blocked on the `daily-briefing` function actually being deployed (task 019).

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
