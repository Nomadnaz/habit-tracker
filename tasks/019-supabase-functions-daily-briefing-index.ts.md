# Task 019: supabase/functions/daily-briefing/index.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006,018

## Goal
Reads briefing_preferences.selected_modules[], queries ONLY selected sources, calls claude-haiku-4-5 for a <150-word summary, returns briefing text.

## Key files
supabase/functions/daily-briefing/index.ts

## Acceptance criteria
- [ ] A module not selected is never queried (privacy + cost property)
- [ ] Output reliably under 150 words
- [ ] Cached in AsyncStorage @habittracker_briefing_{date} by the client

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
