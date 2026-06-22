# Task 069: Travel modal

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 046

## Goal
FUTURE, blocked on Gmail (task 046). app/modals/travel.tsx — manual trip list usable standalone; auto-population from email arrives only once 046 ships.

## Key files
app/modals/travel.tsx, supabase/migrations/021_travel.sql

## Acceptance criteria
- [ ] Manual trip/itinerary entry works without any email integration
- [ ] Auto-population code path clearly gated behind the email-scan dependency

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
