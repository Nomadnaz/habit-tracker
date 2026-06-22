# Task 017: app/modals/companion-chat.tsx

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 016

## Goal
Chat screen wired to a companionType route param, calling supabase/functions/ai-chat and rendering via ChatScreen.

## Key files
app/modals/companion-chat.tsx

## Acceptance criteria
- [ ] Opens from any 'chat with X' entry point with the right companionType
- [ ] Persists and reloads history across app restarts via companion_messages

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
