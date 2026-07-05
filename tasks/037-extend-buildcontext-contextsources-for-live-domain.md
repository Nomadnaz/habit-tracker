# Task 037: Extend buildContext contextSources for live domains

**Phase:** 3 — Wire AI to Data
**Status:** implemented (2026-07-05) — pending live redeploy + on-device verify
**Depends on:** 010,023,025,029,032,034,036

## Goal
Wire each of habitCoach/gym/calorie/activity/sleep companion contextSources to the real tables built in Phase 2 (previously these were config entries pointing at empty tables).

## Key files
supabase/functions/_shared/buildContext.ts, supabase/functions/_shared/companions.ts

## Acceptance criteria
- [x] Each of the 5 companions returns real context (not empty arrays) when queried for a user with logged data — see notes below for what each one reads.
- [x] Query performance acceptable for a single user's full history (add basic limits/windowing if needed) — every new query is windowed (7/14-day lookback or a small `.limit()`), matching the existing `tasks`/`pb_log` pattern in the same file.

## Notes (2026-07-05)
- `gym` already had real contextSources (`workout_done_log`/`pb_log`/`body_weight_logs`) from an earlier session — task 025 (PPL planner UI) is still pending, but that's a UI feature on top of the same already-live tables, not a context-source blocker, so `gym`'s wiring needed no changes here.
- `habitCoach` gained `habit_logs` (per-habit completion counts over the last 14 days, joined against the user's active `habits`).
- Two companion types didn't exist yet and were added to `companions.ts` (the 14-type roster in system-model.md includes them, v1 just hadn't reached their domains yet): **`calorie`** (`meals` — today's calorie total + a 3-day recent list; `log_meal` action declared but still `unsupported` in actionExecutor per tasks/039, unchanged here) and **`activity`** (`activities` — last 2 weeks, type/distance/duration) and **`sleep`** (`sleep_logs` avg/latest hours + `sleep_phone_logs` latest Phone Down Challenge result/streak).
- No chat entry point wires to these three new companion types yet — `components/ChatScreen.tsx` still hardcodes `companionType: 'habitCoach'` for its one call site (the Today screen). Exposing `calorie`/`activity`/`sleep` chat needs a companion picker or per-screen chat entry — that's UI wiring, out of this task's scope (context-source plumbing only).
- Not redeployed — `supabase functions deploy ai-chat` still needs to run against the live project before any of this is reachable, same as every other pending Edge Function change this session.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
