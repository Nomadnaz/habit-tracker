# Task 078: Nav restructure — reconcile 7 tabs + 10 header icons against the 5-tab decision

**Phase:** 8 — Polish
**Status:** DONE (2026-07-10, Code Audit v2 fix plan P1)
**Depends on:** 001

## Why this task exists
system-model.md states the canonical decision: **5 tabs — Today / Habits / Health / Fitness / Life-hub. Profile via header icon.** An audit (2026-07-06) found the app never converged on that — `app/(tabs)/_layout.tsx` currently registers **7** tab screens (TODAY, HABITS, BODY, ACTIVITY, TREE, PROGRESS, PROFILE), and building has continued domain-by-domain with no single screen owning "Health" or "Life-hub" as a hub. The result: `calorie`, `sleep-detail`, `mood`, `goals`, `cycle-tracking`, `finance`, `library` all currently live as standalone routes (`app/calorie.tsx`, `app/modals/*.tsx`) reached only via ad-hoc entry points, not a consistent hub pattern. This is flagged as the app's most visible architectural drift, and it compounds every session a new domain screen is added without a home.

This task does NOT restructure navigation. It decides — once — which of the two ways to close the gap is correct, and writes down the resulting route map so the next session can implement it mechanically instead of re-litigating the decision.

## The decision
Pick ONE:
- **(a) Enforce the 5-tab plan.** Consolidate today's 7 tabs + standalone screens into 5 tabs, with Health and Fitness as hub screens that route to their sub-screens (a domain picker or scrollable sections), and Profile/Life-hub content behind the header icon.
- **(b) Formally revise system-model.md.** If 7 tabs + hub-via-header has turned out to be the better shape in practice (e.g. because TREE/PROGRESS are frequently-checked, not buried), update system-model.md's Navigation row to match reality instead of forcing a retrofit.

Do not leave this undecided — either outcome is fine, but system-model.md and the shipped code must agree after this task, whereas today they don't.

## Current route inventory (as of 2026-07-06, for whoever picks this up)
Tabs (`app/(tabs)/`): index (TODAY), habits (HABITS), gym (BODY), activity (ACTIVITY), tree (TREE), progress (PROGRESS), profile (PROFILE) — 7.
Standalone/modal routes reached via header icons or deep links, not tabs: `calorie.tsx`, `focus-timer.tsx`, `steps.tsx`, `workouts.tsx`, `workout-detail.tsx`, `ble-bridge.tsx`, `calendar/*`, `modals/cycle-tracking.tsx`, `modals/finance.tsx`, `modals/goals.tsx`, `modals/library.tsx`, `modals/mood.tsx`, `modals/search.tsx`, `modals/sleep-detail.tsx`, `settings/*`.

A candidate 5-tab mapping (not binding — the point of this task is to make and record this call deliberately):
- **Today** → index.tsx (unchanged)
- **Habits** → habits.tsx (unchanged)
- **Health** → hub over gym (BODY)/activity/calorie/sleep-detail/mood/cycle-tracking
- **Fitness** → *(if kept distinct from Health)* workouts/workout-detail/steps/tree/progress, OR fold into Health per system-model.md's actual 5-name list (Today/Habits/Health/Fitness/Life-hub has both — check which sub-domains each name is meant to own before assuming this split)
- **Life-hub** → goals/finance/library/focus-timer, with Profile reached via the header icon per the canonical row

## Acceptance criteria
- [ ] One of (a)/(b) above is chosen and stated explicitly in this file's "Decision" section (append it — don't silently pick without recording it)
- [ ] If (a): `app/(tabs)/_layout.tsx` registers exactly 5 tabs; every screen currently only reachable ad-hoc has a discoverable path from one of them
- [ ] If (b): system-model.md's Navigation row is rewritten to describe the actual shipped structure
- [ ] current-state.md updated to reflect whichever outcome, so this doesn't silently re-drift

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.

## Decision (2026-07-10)
Chose **(a) enforce the 5-tab plan**, per the Code Audit v2 fix plan's P1 phase. Shipped mapping:
- **TODAY** → `index.tsx`, unchanged content; header cut from 10 icons to 4 (search, calendar, profile, settings) — calorie/bluetooth/goals/finance/mood/library moved out, sign-out moved to the new Profile-screen icon.
- **HABITS** → `habits.tsx`, unchanged.
- **HEALTH** → new `health.tsx`, a pure card-grid hub (`router.push` to existing routes, no new logic): calories, sleep, mood, steps, body-log (routes to Fitness tab's water/weight modals — not duplicated), cycle tracking.
- **FITNESS** → `gym.tsx` retitled from "BODY", unchanged content plus a new RECORD ACTIVITY button (→ hidden `activity` tab route) and a wired progress icon (→ hidden `progress` tab route, previously dead in the header).
- **LIFE** → new `life.tsx`, a pure card-grid hub: goals, finance, library, focus timer, calendar. This is the `life` companion's first real entry point (Code Audit v2 §1.5 flagged it as configured-but-unreachable).

`tree.tsx` deleted (dead — its `bonsai` table was dropped from prod 07-06). `activity`, `progress`, `profile` stay registered in `_layout.tsx` with `options={{ href: null }}` — reachable via `router.push` (from Fitness/Today headers) but no tab-bar slot, avoiding a rebuild of any of their working internals. Bluetooth icon moved from Today's header into Settings → Connected Devices. Verified every formerly-icon-reached route still has a live `router.push` call after the change (grepped); `tsc`/`vitest` held at the pre-existing baseline (no new errors/failures).
