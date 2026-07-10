# handover 3 — Strava/Cal AI integration session

> Written 2026-07-09. Does NOT supersede `handover.md` or `handover-2-kickstarter-and-device-testing-loop.md`
> — those cover a parallel Supabase-infra/Kickstarter track. This handover covers a third, separate track:
> de-faking the calorie/body/gym/activity trackers and splitting them into dedicated pages, Cal AI/Strava-style.
> Second Brain: `~/esp/SecondBrain/Conversations/2026-07-09-strava-cal-ai-integration-session.md` (session log)
> and `~/esp/SecondBrain/Projects/Habit Tracker/Build/2026-07-07 Cal AI-Strava Parity Pass.md` (full technical detail).
> Research that started it: `~/esp/SecondBrain/Research/{Cal AI Research, Strava Research, Implementation Strategy}.md`.

## 30-second orientation

Investigated why the calorie/run/gym trackers felt weak vs. Cal AI/Strava — found they were substantially
**fake**, not just feature-light: three independent fake-data systems in body/gym/steps, a hardcoded
520-calorie "AI estimate" fallback, and three mega-screens where those apps use one-screen-per-flow. Fixed
both problems in one pass. **A real, likely-user-facing bug was also found and fixed this session**: the
background-GPS code added here could have crashed the app on every launch in Expo Go — see below, this is
probably what `handover-2` logged as "the Expo app throws an error on open."

## Read in this order
1. `system-model.md` — canonical architecture, wins every conflict.
2. `database.md` — schema reference.
3. `current-state.md` — updated this session (Gym/Body hub, Profile/Progress, Calorie/Nutrition, Activity
   rows; a new progress-log entry; migration/deploy status for `025`/`food-vision`).
4. This file.

## What happened this session (3 commits, all pushed to local `main` — confirm `git push` to origin)

**Commit 1 — `feat: remove fake data, split calorie/gym/activity into dedicated pages`** (the big one, 38 files):
- Deleted `lib/body-data.ts`'s persisted `seedData()` (fake steps/training history, headline lifts,
  "weakest muscle," strength trend, sleep, protein) and `lib/steps-data.ts`'s entirely separate fake
  run-tracker (hardcoded 9.6 km/h, zero GPS). Real replacements live in new `lib/bodyFormulas.ts`.
- `lib/foodVision.ts` no longer falls back to a hardcoded 520-calorie plate on failure — returns `null`,
  confirm screen shows a blank editable form instead.
- New `lib/nutritionFormulas.ts`: real Mifflin-St Jeor nutrition targets from onboarding's age/sex/height/weight.
- `app/calorie.tsx` → `app/calorie/{index,capture,confirm,history}.tsx`. `app/(tabs)/gym.tsx` slimmed, detail
  moved to new `app/strength.tsx`. `app/(tabs)/progress.tsx` (was a 17-line dead stub) rebuilt into a real
  stats/trophy-case page. `app/(tabs)/activity.tsx` is now record-only; new `app/activity-summary.tsx`
  **finally builds task 033** (real per-km splits, real elevation profile) + new `app/activity-history.tsx`.
- New Supabase Storage migration `025_meal_photo_storage.sql` (meal photos previously never left the device).
- Background GPS recording implemented (`lib/locationTask.ts`, new `expo-task-manager` dependency, `app.json`
  background-location config) — **flagged unverified**, no device test done.
- vitest added from scratch (32 tests) — `lib/bodyFormulas.test.ts`, `lib/nutritionFormulas.test.ts`,
  `lib/activityFormulas.test.ts`.

**Commit 2 — `docs: mark food-vision deployed, migration 025 applied`**: after explicit user confirmation
(the auto-mode classifier blocks production deploys by default, twice in this session), applied migration
`025` and deployed `food-vision` (v1, ACTIVE) via the Supabase MCP.

**Commit 3 — `fix: prevent expo-task-manager from crashing app boot in Expo Go`**: `lib/locationTask.ts`'s
background-task registration required a static `import * from 'expo-task-manager'` at module scope
(imported from `app/_layout.tsx`, so it runs on every app boot). That package's native module
(`requireNativeModule('ExpoTaskManager')`) **can throw at import time** without a custom dev client/EAS
build — meaning this would crash app launch for every user in plain Expo Go, whether or not they ever
touch background GPS. Found while cross-referencing `handover-2`'s unexplained "Expo app throws an error on
open" blocker. Fixed with a lazy `require()` behind a try/catch (same pattern `lib/apple-health.ts` already
uses for `react-native-health`) — background recording now just silently stays unavailable pre-dev-client
instead of crashing anything.

## ⚠️ Immediate priorities, in order

1. **`git push`** — all 3 commits above are local-only; confirm origin is caught up before starting new work.
2. **If the Expo-app-crashes-on-open issue from `handover-2` is still happening after pulling this**, it
   was NOT the `expo-task-manager` issue (that's fixed now) — get the actual error text/stack trace next,
   don't keep guessing at causes.
3. **EAS dev build** (`npx expo prebuild && npx expo run:ios`) — now genuinely useful to run, since the user
   has a physical device + a fresh Apple Developer Program membership. Needed to verify, none of which work
   in Expo Go:
   - Background GPS recording (real outdoor walk, 20-30+ min, phone locked/backgrounded — check both that
     it keeps recording and battery drain).
   - Real camera capture through the new `/calorie/capture` screen.
   - Apple HealthKit connect + sync on the Body hub.
4. **Visual QA pass** of every restructured screen — `npx expo start --web` could not be run this session
   (`react-dom`/`react-native-web` aren't installed in this environment); nothing here has been visually
   confirmed beyond `tsc`/`vitest`/code review.
5. **Snap a real meal photo** end-to-end now that `food-vision` is deployed — confirm it returns a real
   AI estimate instead of the honest-blank-form fallback.

## Known follow-ups deliberately not done this session
- `deleteMeal()` still skips the `postWrite()` fan-out (pre-existing, unrelated, flagged not fixed — matches
  this repo's surgical-changes convention).
- A calorie-specific milestones/badges screen was deliberately not built — the existing cross-domain
  `lib/badges.ts` system already covers meal-logging badges.
- `react-dom`/`react-native-web` were not installed to unblock `expo start --web` — that's a new dependency
  outside this session's approved scope; flagged as an environment gap instead of silently fixed.

## Copy-paste prompt to start the next session

```
Read handover-3-strava-cal-ai-integration.md in ~/esp/habit-tracker, then handover.md and
handover-2-kickstarter-and-device-testing-loop.md for the other two parallel tracks, then current-state.md.
Confirm the 3 commits from the Strava/Cal AI session are pushed to origin. I now have a physical device and
an Apple Developer Program membership — help me get an EAS dev build running so I can test background GPS,
camera capture, and HealthKit sync for real, and confirm the food-vision photo-estimate pipeline actually
works end-to-end now that it's deployed.
```
