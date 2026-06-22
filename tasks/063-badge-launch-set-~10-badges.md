# Task 063: Badge launch set (~10 badges)

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 014

## Goal
postWrite badge-check step flipped on for ~10 launch badges (first habit, 7-day streak, 30-day streak, first workout, 10 workouts, first run, phone-free week, etc.) — not the full 100+ catalogue.

## Key files
supabase/migrations/015_badges.sql, lib/postWrite.ts (badge step enabled)

## Acceptance criteria
- [ ] Exactly the launch set is active, not the full catalogue
- [ ] Hidden badges show as '???' until unlocked
- [ ] Earning a badge fires a push notification and a friend-feed event (the latter still flagged off until task 068)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
