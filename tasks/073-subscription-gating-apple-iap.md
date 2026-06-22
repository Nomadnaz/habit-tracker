# Task 073: Subscription gating (Apple IAP)

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 044,072

## Goal
Wire RevenueCat entitlements to actually gate Pro/Premium features per the Monetisation Tiers table. Do this only once there are real users — confirm with the user before flipping any gate live.

## Key files
lib/subscription.ts

## Acceptance criteria
- [ ] Every gate checked server-side in the relevant Edge Function, never trusted from the client alone
- [ ] Free tier message cap (5-10/day) enforced via api_usage, matching the corrected cost math in the spec

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
