# Task 061: Daily profile-note generation

**Phase:** 7 — Obsidian Sync
**Status:** pending
**Depends on:** 019,059

## Goal
Extend daily-briefing to also generate profile_md (rolling profile note with computed trends) alongside the existing briefing text.

## Key files
supabase/functions/daily-briefing/index.ts (extended)

## Acceptance criteria
- [ ] profile_md includes at least one computed trend (e.g. 'sleep trending down 3 weeks'), not just a snapshot
- [ ] Journal/therapy content never quoted in the generated profile note

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
