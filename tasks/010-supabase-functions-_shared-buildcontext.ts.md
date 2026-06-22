# Task 010: supabase/functions/_shared/buildContext.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006,007

## Goal
Canonical context builder (Deno). Given userId + companionType, runs parallel queries over the companion's contextSources plus shared cross-companion context (sleep, recovery, today's plan). lib/buildContext.ts becomes a thin re-export only.

## Key files
supabase/functions/_shared/buildContext.ts, lib/buildContext.ts

## Acceptance criteria
- [ ] _shared copy is the only place with real logic
- [ ] lib/ copy is a one-line re-export, never diverges
- [ ] Returns a typed ContextObject

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
