# Task 067: Cycle tracking

**Phase:** 8 — Polish
**Status:** partially implemented (2026-07-05) — Face ID gate deliberately NOT built
**Depends on:** 013

## Goal
FUTURE. app/modals/cycle-tracking.tsx, opt-in only (Female at onboarding or Settings toggle), stricter RLS, separate Face ID lock, never in shared AI context or briefing without explicit per-category opt-in.

## Key files
app/modals/cycle-tracking.tsx, lib/cycle-data.ts (new), supabase/migrations/020_cycle.sql (`019` was taken by Mood this session)

## Acceptance criteria
- [x] Hidden by default for every user — no entry point exists anywhere except a Settings row explicitly labeled "Cycle tracking (off by default)"; the modal itself shows an opt-in gate screen (nothing else) until turned on.
- [x] Cycle data confirmed absent from buildContext's shared block unless the specific opt-in is set — simplest possible satisfaction of this: there is no `cycle`/`cycle_logs` entry anywhere in `_shared/companions.ts` or `_shared/buildContext.ts` at all, opted in or not. `lib/cycle-data.ts`'s `addLog()` also deliberately skips `postWrite()` so cycle data never enters `cumulative_stats`/badges/context-summary either.
- [ ] Face ID gate independent of the app-wide Face ID setting — **not implemented.** No `expo-local-authentication` dependency is installed and there's no device this session to verify a biometric flow works correctly; getting this wrong on a screen protecting reproductive-health data is worse than leaving it undone. Same reasoning as journal/therapy encryption (task 066).

## Notes (2026-07-05)
"Stricter RLS" beyond standard per-user row ownership isn't a real Postgres RLS primitive — Postgres RLS has no stronger unit than row ownership to offer here. What "stricter" means in practice is: opt-in gating, exclusion from buildContext entirely, and (once built) the separate Face ID lock. `average_cycle_length`-based next-period prediction is included as basic MVP value. Onboarding does NOT ask about this (no "Female at onboarding" prompt was added to the 10-screen flow built earlier this session — a Settings-only opt-in was simpler and avoids putting a sensitive question in front of every new user regardless of relevance). tsc clean. Not run live or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
