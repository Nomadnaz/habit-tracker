# Task 040: Precomputed flags

**Phase:** 4 — Cross-AI Intelligence
**Status:** pending
**Depends on:** 037

## Goal
Add OVERREACHING, SLEEP_DEBT, UNDERFUELLING, LOW_PROTEIN, STRESS_SLEEP flags computed in buildContext from the live data already wired.

## Key files
supabase/functions/_shared/buildContext.ts (extended)

## Acceptance criteria
- [ ] Each flag has a documented trigger condition (e.g. SLEEP_DEBT = 3+ nights under target)
- [ ] Flags appear in the context object and are referenced by at least one companion's prompt template

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
