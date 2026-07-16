# Task 060: remember_about_user + search_vault actions

**Phase:** 7 — Obsidian Sync
**Status:** done (2026-07-16, code only — not yet deployed, see note)
**Depends on:** 059

## Goal
New actionExecutor actions: remember_about_user appends to assistant_notes_md (no PreviewCard needed — internal, low-risk); search_vault does FTS over vault_files, never iCloud directly.

## Key files
supabase/functions/_shared/actionExecutor.ts (extended)
supabase/functions/daily-briefing/index.ts (re-summarization)

## Acceptance criteria
- [x] assistant_notes_md re-summarised by daily-briefing once it exceeds ~1.5-2k tokens — `resummarizeAssistantNotes()` in `daily-briefing/index.ts`, fires above a 7000-char (~1.75k token) threshold, condenses via Haiku, fire-and-forget alongside the existing `updateUserContextSummary` call.
- [x] search_vault never touches the filesystem, only the vault_files table — turned out to already be satisfied, just not as an explicit action: `buildContext.ts`'s `want('vault')` branch (line ~534) does FTS over `vault_files` keyed on the user's message, for any companion with `'vault'` in `contextSources` (currently life/schedule + work/focus). This is the *correct* shape given this codebase's action model — `processActions()` runs strictly after the model's completion, so an explicit `search_vault` action's results could never feed back into the same turn's response; pre-fetching into context before the Claude call is the only way a search result actually grounds an answer.

**Note:** `daily-briefing` needs its own redeploy for the re-summarization to go live — code committed, not deployed, per the standing "every production deploy needs its own explicit instruction" rule.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
