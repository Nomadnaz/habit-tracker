# Task 035: Migration: sleep domain (manual + phone-down)

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 002

## Goal
Add sleep_logs, sleep_phone_logs, winddown_logs. Skip sleep_stages/sleep_movement_logs/sleep_correlations until a wearable integration exists (task 047 territory) — wearable-only data has nothing to populate it yet.

## Key files
supabase/migrations/009_sleep.sql

## Acceptance criteria
- [ ] Migration runs clean
- [ ] sleep_phone_logs has the columns needed for the Phone Down Challenge specifically

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
