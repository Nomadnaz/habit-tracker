# Task 036: Sleep detail modal + Phone Down Challenge

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 035

## Goal
app/modals/sleep-detail.tsx: manual sleep log (bedtime/wake/quality), the Phone Down Challenge (iOS Sleep Focus detection + manual shortcut fallback), weekly chart. Per system-model, lead with the Phone Down Challenge — it's the most original, least hardware-dependent feature here.

## Key files
app/modals/sleep-detail.tsx

## Acceptance criteria
- [ ] Challenge result (Pass/Fail/Close) calculated correctly against the user's target time
- [ ] Streak counter for the challenge separate from general habit streaks
- [ ] Logging a night goes through postWrite('sleep_log', record)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
