# Task 014: lib/postWrite.ts fan-out

**Phase:** 1 — Companion Infra
**Status:** implemented (2026-07-05) — pending live migration run + on-device verify
**Depends on:** 006,008

## Goal
The single fan-out function every screen calls after a write: increment cumulative_stats (live), update streak via lib/streaks.ts (live), badge check / friend-feed / Obsidian write (flagged no-ops behind featureFlags). Uses Promise.allSettled.

## Key files
lib/postWrite.ts

## Acceptance criteria
- [x] Exactly one exported postWrite(entity, record, action) function
- [x] Steps 3-5 are real functions that early-return when their flag is off — not missing — badge check is now real (task 063); friend-feed/Obsidian remain deliberate no-op stubs (social/Obsidian are both correctly FUTURE per current-state.md, not behind a literal featureFlags entry since neither has a UI yet to gate).
- [x] A failing side effect never throws or blocks the caller — `Promise.allSettled`, `updateStreak` also individually `.catch()`'d since it now runs outside that batch (see tasks/063 notes for why).

## Notes (2026-07-05)
This task sat "pending" since it was written, but `incrementCumulativeStats` was still a `console.log` stub the whole time — the `cumulative_stats` table had never been created despite being called "live" for MVP. Fixed while wiring up task 063's badges (which needed real counts to check against): added `supabase/migrations/016_cumulative_stats.sql` and real increment logic (habits completed, gym sessions, run/walk distance — only what's directly derivable from the entities that exist today; steps/focus/books/movies stay at 0 until those domains write through here too). Also fixed a real ordering bug: `updateStreak` now runs first (awaited on its own) before the rest of the effects run in parallel, since `checkBadges` depends on state `updateStreak` just wrote and the old single-`Promise.allSettled` shape raced the two with no guaranteed order.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
