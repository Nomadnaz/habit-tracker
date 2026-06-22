# Task 027: GPS gym check-in

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 025

## Goal
expo-location reads coordinates when logging a session; gym location set once in user_profiles.gym_lat/gym_lng; check-in verified within ~200m.

## Key files
app/(tabs)/gym.tsx (extended), lib/user-profile.ts

## Acceptance criteria
- [ ] Location permission requested only when this feature is used
- [ ] Verification badge shown only within the 200m radius
- [ ] Works without a wearable connected

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
