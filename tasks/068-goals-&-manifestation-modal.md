# Task 068: Goals & manifestation modal

**Phase:** 8 — Polish
**Status:** implemented (2026-07-05) — pending live migration/deploy + on-device verify
**Depends on:** 013

## Goal
FUTURE. app/modals/goals.tsx — structured goals/milestones/progress logging built fully; vision board treated as optional polish, can ship after the structured part.

## Key files
app/modals/goals.tsx, lib/goals-data.ts (new), supabase/migrations/017_goals.sql (`020` was too far ahead — next free number was 017)

## Acceptance criteria
- [x] Structured goals/milestones functional without the vision board — goals, milestones (checkable), and progress % (derived from milestone completion, falling back to the latest manually-logged `goal_logs.progress_percent` when a goal has no milestones yet). Vision board (`affirmations`/`vision_board_items`) intentionally not created — optional polish per this task's own text.
- [x] Goals AI references real habit/workout/book data when discussing progress — new `goals` companion (`_shared/companions.ts`) with `contextSources: ['goals', 'habit_logs', 'workout_done_log', 'user_context_summary']`; new `want('goals')` block in `_shared/buildContext.ts` lists active goals with their milestone completion %. "book" data isn't referenced — the Library domain doesn't exist (task 064, not built this session at the time this was wired — see progress log for whether that changed).

## Notes (2026-07-05)
Entry point: a new flag-checkered icon on the Today header, `router.push('/modals/goals')`. `postWrite('goal', …)` required adding `'goal'` to `lib/postWrite.ts`'s `Entity` union (same pattern as every other domain added this session). No chat entry point wires to the new `goals` companion yet (same limitation noted for `calorie`/`activity`/`sleep` in tasks/037 — `ChatScreen.tsx` still hardcodes `habitCoach`). tsc clean. Not deployed (`ai-chat` needs a redeploy to pick up the new companion/contextSources) or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
