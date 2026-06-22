# Task 006: Migration: companion + AI plumbing tables

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 002

## Goal
Add companions, companion_messages, companion_personas, api_usage, briefing_preferences, user_context_summary tables per database.md, with RLS user_id = auth.uid() on each.

## Key files
supabase/migrations/003_companion_infra.sql

## Acceptance criteria
- [ ] Migration runs clean against current schema
- [ ] RLS enabled and policy present on every new table
- [ ] user_context_summary has exactly one row per user (primary key on user_id)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
