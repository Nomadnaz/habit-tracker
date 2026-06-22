# Task 006: Migration: companion + AI plumbing tables

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 002

## Goal
Add companions, companion_messages, companion_personas, api_usage, briefing_preferences, user_context_summary tables per database.md, with RLS user_id = auth.uid() on each.

## Key files
supabase/migrations/00N_companion_infra.sql — **check `ls supabase/migrations/` for the next available number before naming it; do not assume 003.** (003 was claimed by tasks/005's gym/body reconciliation, written after this task was originally scoped — every hardcoded migration number in a *pending* task file is a hint, not a guarantee; always verify against what's actually on disk.)

## Acceptance criteria
- [ ] Migration runs clean against current schema
- [ ] RLS enabled and policy present on every new table
- [ ] user_context_summary has exactly one row per user (primary key on user_id)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
