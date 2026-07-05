# Task 057: Migration: user_context_summary + vault_files

**Phase:** 7 — Obsidian Sync
**Status:** implemented (2026-07-05) — pending live migration run
**Depends on:** 006

## Goal
Add vault_files table with FTS index (the user_context_summary table already exists from task 006 — this task adds vault_files only).

## Key files
supabase/migrations/023_vault_files.sql (`014` was taken by Settings' BYOK table this session)

## Acceptance criteria
- [x] GIN FTS index on vault_files.content present — `idx_vault_files_content_fts`, `to_tsvector('english', content)`.
- [x] RLS enforced, source column constrained to 'app'/'user' — `CHECK (source IN ('app', 'user'))`.

## Notes (2026-07-05)
Schema only — the actual Obsidian sync client (`lib/vaultSync.ts`, task 059) needs iCloud file access and isn't built this session (device-gated, same reasoning as this session's other device-only deferrals). Nothing writes to `vault_files` yet; the table + index exist so that work has somewhere to land without another migration.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
