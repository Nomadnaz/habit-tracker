# Task 032: Activity tracking screen (basic GPS)

**Phase:** 2 — Screens
**Status:** partially implemented (2026-07-05) — foreground tracking done, background + battery test blocked on a device
**Depends on:** 031

## Goal
app/(tabs)/activity.tsx: type selector (Hike/Run/Walk), live tracking screen with pace-coloured route line, duration/distance/pace counters, elevation via expo-location altitude. Deliberately basic per system-model: track, draw, summarise — nothing fancier yet.

## Key files
app/(tabs)/activity.tsx, lib/activity-data.ts (new)

## Acceptance criteria
- [ ] Background location handled without excessive battery drain in a 30-min test run — **not attempted.** What's built is FOREGROUND-only tracking (`Location.watchPositionAsync` while the screen is open); backgrounding the app mid-activity stops recording. A battery-drain test is inherently a device measurement — can't be faked or skipped past honestly. Upgrading to `Location.startLocationUpdatesAsync` + a background task is the deliberate next step once this can run on a device.
- [x] Route stored as GeoJSON in activities.route_geojson — `toGeoJSON()` in `lib/activity-data.ts`, a plain `LineString` (`[lng, lat]` pairs, correct GeoJSON coordinate order).
- [x] Saving an activity goes through postWrite — entity `'activity'`, added to `lib/postWrite.ts`'s `Entity` union (same pattern as `'meal'`/`'medication'`).

## Notes (2026-07-05)
- No map library is installed (no `react-native-maps`) and adding one is a native-module change that needs a device/EAS rebuild to verify — out of scope to add blind. The route line is instead an abstract SVG polyline normalized to the waypoints' own bounding box, colour-coded per segment by relative pace (green faster / red slower than the activity's average) via `segmentPaces()` in `lib/activity-data.ts`. This satisfies "pace-coloured route line" without a real map underneath; swapping in a real map later is a screen-only change, the data layer doesn't need to move.
- New `ACTIVITY` tab registered in `app/(tabs)/_layout.tsx` (between Body and Tree).
- `activity_stats_cumulative` is bumped (per-type distance, elevation, total time) after each save — see tasks/031 notes for why some of its columns are intentionally missing.
- tsc clean for all new/changed files (same 45 pre-existing, unrelated errors as before this session). Not verified on-device — needs migration `012` run live, then a short walk with location permissions granted to confirm the polyline draws and the activity saves.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
