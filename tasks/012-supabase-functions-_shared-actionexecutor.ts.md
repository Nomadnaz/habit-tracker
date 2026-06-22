# Task 012: supabase/functions/_shared/actionExecutor.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006

## Goal
Shared action parsing + execution. Confidence gates: >0.85 execute (internal Supabase writes only), 0.6-0.85 PreviewCard, <0.6 clarify. All external/irreversible writes (email, LinkedIn, Stripe, calendar) always require PreviewCard regardless of confidence.

## Key files
supabase/functions/_shared/actionExecutor.ts, lib/actionExecutor.ts

## Acceptance criteria
- [ ] Confidence gate implemented exactly as specified
- [ ] External-write actions hard-coded to always require preview, never bypassable by a high confidence score
- [ ] Unwired actions (no companion screens yet) simply return 'not yet supported'

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
