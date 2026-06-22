# Task 041: Cross-domain context wiring

**Phase:** 4 — Cross-AI Intelligence
**Status:** pending
**Depends on:** 040

## Goal
Calorie AI receives gym_plan/workouts; Sleep AI receives stress/HR context (stub until wearables land); all companions receive the relevant flags from task 040.

## Key files
lib/companions.ts (contextSources extended), supabase/functions/_shared/buildContext.ts

## Acceptance criteria
- [ ] Calorie AI can answer 'what's my protein target today' factoring in tomorrow's gym_plan session
- [ ] No companion silently ignores a flag that's relevant to it per the spec's cross-feature-interactions notes

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
