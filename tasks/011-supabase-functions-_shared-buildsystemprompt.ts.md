# Task 011: supabase/functions/_shared/buildSystemPrompt.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 010

## Goal
Builds the system prompt from persona (companion_personas) + context, placing the static/profile/notes portion in a prompt-cache segment per Anthropic's caching API.

## Key files
supabase/functions/_shared/buildSystemPrompt.ts

## Acceptance criteria
- [ ] Cached segment separated from per-turn segment
- [ ] Falls back to companion defaults when no persona row exists yet

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
