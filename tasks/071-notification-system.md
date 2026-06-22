# Task 071: Notification system

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** none

## Goal
expo-notifications wiring with the spec's caps: 8/day total, 2/companion, streak reminder once 2h before midnight, quiet hours, grouped notifications within 30 min, in-app notification centre.

## Key files
supabase/migrations/022_notifications.sql, lib/notifications.ts

## Acceptance criteria
- [ ] Caps enforced server-side where the trigger is server-side (e.g. streak-at-risk), client-side where appropriate
- [ ] Quiet hours suppress everything except medications marked critical
- [ ] Notification centre shows the last 30 days, tap-to-navigate works

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
