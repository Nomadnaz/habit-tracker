# Task 062: Onboarding flow

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 020,023

## Goal
app/(onboarding)/ — 10 screens per the spec: welcome, basics, goals, targets, first-habit, skills, book, connect, account, briefing-builder. Account creation deliberately late (screen 9).

## Key files
app/(onboarding)/*.tsx

## Acceptance criteria
- [ ] Account wall is screen 9, not earlier
- [ ] Completing onboarding sets user_profiles.onboarding_complete = true and routes to (tabs)/
- [ ] Connect screen ships with only Apple Health live, others behind featureFlags

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
