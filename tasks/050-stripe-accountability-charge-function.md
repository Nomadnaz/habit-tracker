# Task 050: Stripe accountability charge function

**Phase:** 5 — Integrations
**Status:** pending
**Depends on:** none

## Goal
FUTURE. accountability_contracts/accountability_charges tables, supabase/functions/stripe-charge/. Card stored as a Stripe payment-method token only, never raw.

## Key files
supabase/migrations/012_accountability.sql, supabase/functions/stripe-charge/index.ts

## Acceptance criteria
- [ ] No card data ever touches the database, only the Stripe token
- [ ] 2-hour cancellation window enforced before a charge fires
- [ ] Charge auto-logs to expenses via postWrite

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
