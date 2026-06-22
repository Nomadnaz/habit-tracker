# Task 013: supabase/functions/ai-chat/index.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006,009,010,011,012

## Goal
Main companion chat Edge Function. Input: message, companionType, userId, optional userApiKey, conversationHistory. Rate-limits via api_usage, classifies, builds context, calls Anthropic with prompt caching, persists to companion_messages, returns {response, actions}.

## Key files
supabase/functions/ai-chat/index.ts

## Acceptance criteria
- [ ] Rejects requests over the per-user daily cap (server-side, not client-trusted)
- [ ] Prompt caching enabled on the system-prompt + context segment
- [ ] Every exchange persisted to companion_messages
- [ ] api_usage row updated per call

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
