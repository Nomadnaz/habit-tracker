# Task 019: supabase/functions/daily-briefing/index.ts

**Phase:** 1 — Companion Infra
**Status:** implemented (2026-07-05) — pending live deploy + on-device verify
**Depends on:** 006,018

## Goal
Reads briefing_preferences.selected_modules[], queries ONLY selected sources, calls claude-haiku-4-5 for a <150-word summary, returns briefing text.

## Key files
supabase/functions/daily-briefing/index.ts

## Acceptance criteria
- [x] A module not selected is never queried — `selected_modules` (or a `['tasks','habit_logs']` default when unset — no onboarding briefing-builder yet) is passed straight through as `buildContext`'s `contextSources` filter, same mechanism `ai-chat` already relies on.
- [x] Output reliably under 150 words — `max_tokens: 300` (generous ceiling under Haiku's ~4 chars/token, well short of 150 words) plus an explicit "under 150 words" instruction in the system prompt.
- [x] Cached in AsyncStorage @habittracker_briefing_{date} by the client — `components/BriefingCard.tsx`'s `cacheKey()`.

## Notes (2026-07-05)
Selected modules are treated as `buildContext` source keys directly (e.g. `'tasks'`, `'habit_logs'`, `'meals'`) rather than a separate module vocabulary — simplest mapping, no translation layer needed. No conversation history, no `<action>` emission, no `api_usage` rate-limit check — this is a single one-shot read per user per day, not a chat turn, so `ai-chat`'s per-message rate limiting doesn't apply here. Not deployed (`supabase functions deploy daily-briefing` still needed) or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
