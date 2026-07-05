# Task 036: Sleep detail modal + Phone Down Challenge

**Phase:** 2 — Screens
**Status:** implemented (2026-07-05) — pending on-device verify
**Depends on:** 035

## Goal
app/modals/sleep-detail.tsx: manual sleep log (bedtime/wake/quality), the Phone Down Challenge (iOS Sleep Focus detection + manual shortcut fallback), weekly chart. Per system-model, lead with the Phone Down Challenge — it's the most original, least hardware-dependent feature here.

## Key files
app/modals/sleep-detail.tsx, lib/sleep-data.ts (new)

## Acceptance criteria
- [x] Challenge result (Pass/Fail/Close) calculated correctly against the user's target time — `scoreChallenge()`: pass at/before target, close within 15min after, fail beyond that.
- [x] Streak counter for the challenge separate from general habit streaks — `computeChallengeStreak()` in `lib/sleep-data.ts`, its own consecutive-pass-days count, not touching `lib/habits-data.ts`'s streak logic.
- [x] Logging a night goes through postWrite — entity `'sleep'` (already in `lib/postWrite.ts`'s `Entity` union, no change needed there).

## Notes (2026-07-05)
- iOS Sleep Focus **auto-detection is not implemented** — it needs native Screen Time/Shortcuts integration (task 042 territory, device-gated). What's built is exactly the "manual shortcut fallback" the task asks for: the user types in when they put the phone down. `sleep_phone_logs.sleep_focus_activated` defaults to `false` and stays unused until that lands.
- Entry point: the existing SLEEP recovery card on the Body hub (`app/(tabs)/gym.tsx`, previously just a static `<Recovery>` display) now opens this modal via `router.push('/modals/sleep-detail')` — mirrors how the water/weight cards already open their own modals in that file.
- Weekly chart is a small local bar chart (plain Views, no new chart dependency) rather than reusing `gym.tsx`'s `Spark` component, which isn't exported.
- tsc clean for all new/changed files (same 45 pre-existing, unrelated errors as before this session). Not verified on-device — needs migration `011_sleep.sql` run live, then a manual sleep log + Phone Down Challenge entry check.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
