# Task 032: Activity tracking screen (basic GPS)

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 031

## Goal
app/(tabs)/activity.tsx: type selector (Hike/Run/Walk), live tracking screen with pace-coloured route line, duration/distance/pace counters, elevation via expo-location altitude. Deliberately basic per system-model: track, draw, summarise — nothing fancier yet.

## Key files
app/(tabs)/activity.tsx

## Acceptance criteria
- [ ] Background location handled without excessive battery drain in a 30-min test run
- [ ] Route stored as GeoJSON in activities.route_geojson
- [ ] Saving an activity goes through postWrite('activity', record)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
