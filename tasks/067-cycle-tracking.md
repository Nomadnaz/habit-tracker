# Task 067: Cycle tracking

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 013

## Goal
FUTURE. app/modals/cycle-tracking.tsx, opt-in only (Female at onboarding or Settings toggle), stricter RLS, separate Face ID lock, never in shared AI context or briefing without explicit per-category opt-in.

## Key files
app/modals/cycle-tracking.tsx, supabase/migrations/019_cycle.sql

## Acceptance criteria
- [ ] Hidden by default for every user
- [ ] Cycle data confirmed absent from buildContext's shared block unless the specific opt-in is set
- [ ] Face ID gate independent of the app-wide Face ID setting

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
