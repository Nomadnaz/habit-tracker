# Task 035: Migration: sleep domain (manual + phone-down)

**Phase:** 2 — Screens
**Status:** written (2026-07-05) — pending live run
**Depends on:** 002

## Goal
Add sleep_logs, sleep_phone_logs, winddown_logs. Skip sleep_stages/sleep_movement_logs/sleep_correlations until a wearable integration exists (task 047 territory) — wearable-only data has nothing to populate it yet.

## Key files
supabase/migrations/011_sleep.sql (`009` was already taken by the Habits migration this session — see "Migration numbers are hints" in CLAUDE.md)

## Acceptance criteria
- [x] Migration written, additive/idempotent, safe to re-run
- [x] sleep_phone_logs has the columns needed for the Phone Down Challenge specifically (`phone_down_time`, `challenge_result`, `streak_count`, plus `sleep_focus_activated` for when auto-detection lands)
- [ ] Run clean against the live Supabase project — **not yet run**, needs a human to paste it into the SQL editor

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
