# Task 048: Wearable OAuth orchestrator

**Phase:** 5 — Integrations
**Status:** pending
**Depends on:** 042

## Goal
lib/wearables.ts: Garmin/Fitbit/Whoop/Polar OAuth flows, sync frequency per device, primary-source selection in wearable_connections, tokens stored only in oauth_tokens.

## Key files
lib/wearables.ts, supabase/migrations/011_wearables.sql

## Acceptance criteria
- [ ] Tokens never stored in wearable_connections, only metadata
- [ ] Garmin sync respects the 40 req/min rate limit with batching
- [ ] Multiple connected devices resolve to one primary per data type

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
