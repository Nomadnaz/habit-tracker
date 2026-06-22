# Task 046: Gmail OAuth + email-scan/email-send

**Phase:** 5 — Integrations
**Status:** pending
**Depends on:** 012,045

## Goal
BLOCKED until task 045 clears. supabase/functions/email-scan/, supabase/functions/email-send/, oauth_tokens table usage, Life AI calendar-and-tasks-only MVP scope first (no email) before this.

## Key files
supabase/migrations/010_oauth_tokens.sql, supabase/functions/email-scan/index.ts, supabase/functions/email-send/index.ts

## Acceptance criteria
- [ ] Every email send goes through a PreviewCard regardless of AI confidence
- [ ] oauth_tokens is the single home for the token — not duplicated elsewhere

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
