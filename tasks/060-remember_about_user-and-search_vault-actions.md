# Task 060: remember_about_user + search_vault actions

**Phase:** 7 — Obsidian Sync
**Status:** pending
**Depends on:** 059

## Goal
New actionExecutor actions: remember_about_user appends to assistant_notes_md (no PreviewCard needed — internal, low-risk); search_vault does FTS over vault_files, never iCloud directly.

## Key files
supabase/functions/_shared/actionExecutor.ts (extended)

## Acceptance criteria
- [ ] assistant_notes_md re-summarised by daily-briefing once it exceeds ~1.5-2k tokens
- [ ] search_vault never touches the filesystem, only the vault_files table

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
