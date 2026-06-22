# Task 057: Migration: user_context_summary + vault_files

**Phase:** 7 — Obsidian Sync
**Status:** pending
**Depends on:** 006

## Goal
Add vault_files table with FTS index (the user_context_summary table already exists from task 006 — this task adds vault_files only).

## Key files
supabase/migrations/014_vault_files.sql

## Acceptance criteria
- [ ] GIN FTS index on vault_files.content present
- [ ] RLS enforced, source column constrained to 'app'/'user'

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
