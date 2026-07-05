# Task 063: Badge launch set (~10 badges)

**Phase:** 8 — Polish
**Status:** implemented (2026-07-05) — pending live migration run + on-device verify
**Depends on:** 014

## Goal
postWrite badge-check step flipped on for ~10 launch badges (first habit, 7-day streak, 30-day streak, first workout, 10 workouts, first run, phone-free week, etc.) — not the full 100+ catalogue.

## Key files
supabase/migrations/015_badges.sql, lib/badges.ts (new), lib/postWrite.ts (badge step enabled)

## Acceptance criteria
- [x] Exactly the launch set is active, not the full catalogue — `BADGES` in `lib/badges.ts`, 10 entries (first_habit, streak_7, streak_30, first_workout, workouts_10, first_run, first_hike, first_meal, phone_free_week, early_bird).
- [x] Hidden badges show as '???' until unlocked — `app/(tabs)/profile.tsx`'s badge grid (see notes; that screen was a pure stub before this).
- [ ] Earning a badge fires a push notification — **not implemented, no notification infra exists** (task 071 territory, needs `expo-notifications` + device push tokens). Earning is persisted (`badges_earned` table + local cache) and logged; surfacing beyond the profile grid is future work, not silently claimed here.
- [x] ...and a friend-feed event, flagged off — unchanged no-op stub (`addFriendFeedEvent`), consistent with social being FUTURE. (The task text says "until task 068", which is Goals, not Social/task 070 — looks like a typo in the original file; left as-is, not touched.)

## Notes (2026-07-05)
- `lib/badges.ts` reads raw AsyncStorage blobs (`@habit_logs`, `@body`, `@activities`, `@meals`) directly rather than importing each domain's `lib/*-data.ts` — importing e.g. `habits-data.ts` from a module `postWrite.ts` itself imports would be a real circular dependency (`postWrite → badges → habits-data → postWrite`). A little duplicated counting logic was the cheaper trade.
- Two data-layer call sites were extended to pass fields the badge checks need: `lib/habits-data.ts`'s `toggleToday` now includes `streak: streak.current` in its `postWrite('habit', …)` record; `lib/sleep-data.ts`'s `logSleep` now includes `wakeTime`, and `logPhoneDown` — which never called `postWrite` at all before this — now does, with `challengeStreak`.
- **Found and fixed a real ordering bug in `lib/postWrite.ts` while wiring this in**: all 6 fan-out effects ran in one `Promise.allSettled`, but `checkBadges` needs streak state that `updateStreak` (a sibling effect) had just written — a genuine race with no guaranteed order. `updateStreak` now runs first and is awaited on its own; the rest still run in parallel via `Promise.allSettled` per task 014's contract.
- **Also closed a long-standing gap while here**: `incrementCumulativeStats` (postWrite step 1, supposed to be "live" per task 014 since day one) was still a `console.log` stub — the `cumulative_stats` table itself had never been created. Added `supabase/migrations/016_cumulative_stats.sql` and real increment logic (habits completed, gym sessions, run/walk distance) — out of this task's literal scope but directly blocking it (badges' own `workouts_10` reads a count that this fix makes real instead of stubbed).
- tsc clean. Not run live (migrations `015`+`016` not yet executed) or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
