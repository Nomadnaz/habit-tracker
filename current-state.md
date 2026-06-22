# current-state.md — habit-tracker
> Living snapshot. Update this file every time a task in `tasks/` is verified done, then commit and push.
> Read this AFTER system-model.md and database.md, BEFORE picking up the next task file.

Last updated: 2026-06-22 (initial architecture pass — tasks/001 generated this file)

---

## WHAT'S ACTUALLY BUILT TODAY (before this task breakdown started)

| Area | File(s) | State |
|---|---|---|
| Auth | `app/_layout.tsx`, `app/(auth)/login.tsx` | Working — Supabase session guard, redirects to login/tabs |
| Today screen | `app/(tabs)/index.tsx` (2268 lines) | Working — tasks, focus timer, scroll wheel UI |
| Gym | `app/(tabs)/gym.tsx`, `app/workouts.tsx`, `app/workout-detail.tsx` | Working, own schema (see below) — no PPL planner, no muscle balance chart, no GPS check-in yet |
| Body (partial) | `app/steps.tsx`, body_weight_logs, water_logs | Working — steps screen separate from a unified body hub; no HealthKit live yet |
| Calendar | `app/calendar/index.tsx`, `app/calendar/day.tsx` | Working |
| Focus timer | `app/focus-timer.tsx` (1372 lines) | Working, standalone — not yet wired to app-blocking (that's FUTURE/entitlement-gated) |
| Profile / Progress / Tree tabs | `app/(tabs)/profile.tsx`, `progress.tsx`, `tree.tsx` | **Stubs only** (16 lines each) |
| AI companions | none | **Not started** — this is the whole of Phase 1 |
| Habits / Medication | none | **Not started** |
| Calorie / Nutrition | none | **Not started** |
| Activity (hike/run/walk) | none | **Not started** |
| Sleep | none | **Not started** |
| Onboarding | none | **Not started** — app currently goes straight to login |
| Everything else in the spec (library, finance, mood, cycle, focus-blocking, social, badges, Obsidian, wearables, integrations, monetisation) | none | **Not started**, correctly FUTURE per the spec |

## SCHEMA REALITY CHECK
The existing app uses its own table names that **do not match** the spec's proposed schema:
```
workout_templates, workout_exercises, workout_done_log, pb_log, body_weight_logs, water_logs
```
vs. the spec's proposed:
```
workouts, personal_bests, body_logs
```
`exercises` is the one table that already matches. No `supabase/migrations/` folder exists — schema changes have been applied via loose `.sql` files run manually in the Supabase SQL editor (`run-this-once.sql`, `workout-schema.sql`, `user_focus.sql`, `user_focus_durations.sql`, `task_schedule_columns.sql`). See `database.md` for the reconciliation plan and `tasks/002` / `tasks/005` for the migration work.

## KNOWN CONFLICTS WITH THE OLD CLAUDE.md (now corrected)
- Date keys were `"YYYY-M-D"` (0-indexed month, e.g. `"2026-5-1"` for June 1). Canonical is now zero-padded `YYYY-MM-DD`, 1-indexed. **Not yet migrated in code** — see `tasks/003`/`tasks/004`.
- Design tokens were light theme (`#F5F5F5` bg, `#E0E0E0` border). Canonical is dark (`#0A0A0A` bg, `#FF4D00` accent, `#2A2A2A` border, PressStart2P/SpaceMono). **Not yet migrated in code** — see `tasks/077`, deliberately last (cosmetic, non-blocking).
- Old 4-tab layout (`gym`, `tree`, `progress`, `profile`, plus `index`) — new canonical nav per system-model.md is 5 tabs: Today / Habits / Health / Fitness / Life-hub, profile via header icon. Tab restructuring happens incrementally as each domain screen in Phase 2 lands; no big-bang rename planned.

## GIT STATE (as of this architecture pass)
- Remote: `https://github.com/Nomadnaz/habit-tracker.git`, branch `main`
- Local was 2 commits ahead of origin, with uncommitted changes to `app.json`/`package.json`/`package-lock.json` before this session
- This session adds: `system-model.md`, `database.md`, `current-state.md` (this file), rewritten `CLAUDE.md`, `tasks/001`–`tasks/077`

## NEXT TASK
`tasks/005-schema-reconciliation:-gym-body-domains.md` (tasks/001-004 are done; tasks/004 has one open follow-up — run `supabase/migrations/002_date_key_format.sql` manually against the live project, and confirm on a real device since no simulator was available this session).

## ⚠️ ACTION NEEDED BY YOU (cannot be done from this session)
- Run `supabase/migrations/002_date_key_format.sql` once, manually, in the Supabase SQL editor. It is NOT safely re-runnable — see the warning in the file.
- Open the app on a real device/simulator once and confirm Today/Calendar/Steps/Workouts still look right after the date-key migration (tsc is clean, but nothing was visually verified this session — no simulator was attached).
- `git push` from a machine with GitHub credentials — this session has none. Currently 6 local commits ahead of `origin/main`.

## HOW TO UPDATE THIS FILE
After a task is implemented, deployed, and tested:
1. Tick its acceptance criteria in the task file (or mark the file Status: DONE if fully verified).
2. Add a one-line entry below under "Progress log" with the date.
3. Update the "WHAT'S ACTUALLY BUILT TODAY" table above if the task changed a screen's state.
4. Commit and push.

## PROGRESS LOG
- 2026-06-22 — tasks/001 done: canonical docs (system-model.md, database.md, current-state.md) created, CLAUDE.md rewritten, tasks/002–077 generated.
- 2026-06-22 — tasks/002 done: supabase/migrations/001_baseline.sql created from the live schema (run-this-once.sql). Discovered workout-schema.sql defines a conflicting, never-wired-up schema — marked dead rather than folded in. All five loose .sql files marked superseded in-place. Migration not yet executed against the live Supabase project (no DB credentials/CLI in this session) — run it manually in the SQL editor.
- 2026-06-22 — tasks/003 done: found 5 independent inline re-implementations of the old "YYYY-M-D" date key (app/(tabs)/index.tsx, lib/task-schedule.ts, lib/body-data.ts, lib/apple-sync.ts, lib/workout-data.ts), affecting tasks.date / workout_done_log.date / pb_log.date in Supabase plus @tasks and BodyData.stepsHistory in AsyncStorage. Plan: consolidate into lib/dateKey.ts, one-time rewrite (no dual-format support — no production users yet), SQL migration for Supabase columns + a guarded boot-time AsyncStorage migration. Execution is tasks/004.
- 2026-06-22 — tasks/004 done: added lib/dateKey.ts as the single canonical implementation; found and fixed a 6th call site (app/calendar/index.tsx) missed by tasks/003's inventory; wrote lib/migrateDateKeysV2.ts (one-time AsyncStorage migration, wired into app/_layout.tsx ahead of the splash-screen hide and auth redirect) and supabase/migrations/002_date_key_format.sql (Supabase column rewrite, not yet executed live). Used plain Date math instead of adding date-fns, to avoid touching package.json's already-dirty state for no functional gain. tsc clean (28 pre-existing errors, unrelated, unchanged). No on-device visual verification possible this session.
