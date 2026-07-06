# Task 038: End-to-end companion chat for the 5 live domains

**Phase:** 3 — Wire AI to Data
**Status:** was unrunnable, now unblocked — still needs the actual on-device verification pass
**Depends on:** 013,017,037

## Goal
Verify habitCoach, gym, calorie, activity, sleep companions answer real questions against real data end-to-end through the deployed ai-chat function.

## Key files
n/a — verification task

## Acceptance criteria
- [ ] Each of the 5 companions answers at least 3 of its example questions from the spec correctly using real logged data
- [ ] Responses cite specific numbers from the user's actual data, not generic text

## Notes (2026-07-06)
This task was literally impossible to run before today: `components/ChatScreen.tsx` hardcoded `companionType: 'habitCoach'` everywhere, so 4 of these 5 companions (gym/calorie/activity/sleep) had no chat UI at all — an audit found this and called it the single highest-leverage fix available (task 011, "companion picker UI"). Fixed: `ChatScreen` now takes a `companionType` prop (default `'habitCoach'`, unchanged behavior at the existing calendar/day.tsx call site), and every domain screen has its own entry point: `app/calorie.tsx` → calorie, `app/(tabs)/activity.tsx` → activity, `app/modals/sleep-detail.tsx` → sleep, `app/(tabs)/gym.tsx` → gym (replaced a decorative, non-functional info icon), plus `app/modals/goals.tsx` → goals and `app/modals/mood.tsx` → mood (2 more companions this task doesn't cover but were equally unreachable). **`focus` and `life` are still unwired** — `focus`'s screen (`app/focus-timer.tsx`) is a large, orientation-sensitive, unfamiliar-to-this-session file; wiring it in without device testing was judged too risky. `life` has no distinct screen yet (it overlaps with habitCoach's task/schedule domain until a Life-hub screen exists per system-model.md's 5-tab plan).

This task itself — actually running each companion against real data and grading its 3 example answers — still needs a device and hasn't been done. What's done is removing the reason it couldn't be attempted at all.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
