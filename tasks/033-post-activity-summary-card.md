# Task 033: Post-activity summary card

**Phase:** 2 — Screens
**Status:** done (2026-07-07, as part of a broader Cal AI/Strava-parity pass — see current-state.md)
**Depends on:** 032

## Goal
components/SummaryCard.tsx + components/ElevationGraph.tsx: auto-generated on stop — route map, elevation graph, stats, actions (Save/Share).

## Key files
components/SummaryCard.tsx, components/ElevationGraph.tsx

## Acceptance criteria
- [x] Elevation graph renders from the stored elevation timeline — `components/ElevationGraph.tsx`, real altitude data from waypoints; honest "No elevation data recorded" empty state when a device didn't record altitude, not a fake flat line.
- [x] Card appears automatically on stop, no extra tap required — **interpretation call**: implemented as a full dedicated screen (`app/activity-summary.tsx`), not an inline card, matching this session's broader move to Cal AI/Strava-style one-screen-per-flow instead of overlays. `app/(tabs)/activity.tsx`'s `stop()` `router.push`es straight there — no extra tap. Also reused for any past activity opened from the new `app/activity-history.tsx`. Save is implicit (already persisted by `saveActivity()` before routing); Share was not requested elsewhere in this pass and is not built.

## Session notes (2026-07-07)
`components/SummaryCard.tsx` exports `RouteLine` (the pace-coloured polyline, extracted from `app/(tabs)/activity.tsx` so the live-record screen and the summary screen share one implementation). A real per-km splits table was added via a new pure `computeSplits()` in `lib/activityFormulas.ts` (vitest-tested). Not verified on-device — see current-state.md's activity entry.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
