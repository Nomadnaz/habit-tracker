# Handover 4 — Code Audit v2: P0/P1/P2 done, ai-chat redeploy pending

Session: 2026-07-10. Worked through `SecondBrain/Projects/Habit Tracker/Build/2026-07-09 Code Audit v2 — Fix Plan.md` in order, starting from P0.

## Priority #1 next session: deploy `ai-chat`

P2's SharedContext work is fully coded, committed, and pushed (`50437c3`), and its migration (`029_daily_steps.sql`) is live. But the `ai-chat` Edge Function itself is still running **v22** — pre-P2. Auto mode's safety classifier blocked the redeploy this session, reasoning that a production Edge Function deploy needs to be explicitly named by the user, not inferred from a fix-plan document.

To close this:
```
supabase functions deploy ai-chat
```
or explicitly ask the assistant to "deploy ai-chat" next session — an explicit instruction should clear the classifier. Once deployed, run the two smoke tests P2 specifies: ask the activity companion a calorie question (should now see meal data via the SharedContext block), ask the focus companion "how much did I focus this week?" (should now see `focus_sessions` data, assuming at least one focus session has completed since this session — the app-side write is new).

## What shipped this session

### P0 — Hygiene
- Pushed 3 previously-stranded commits + 2 untracked handover files.
- Deleted a stale comment in `_shared/companions.ts` claiming `log_meal` was unsupported (it's wired).
- Refreshed `current-state.md` against live `list_migrations`/`list_edge_functions` — found a real gap the old prose missed: `save-api-key` is written and committed but **never deployed**, so the Settings BYOK toggle has nothing to call yet.
- Vault hygiene: filled 3 zero-byte stub notes, wrote `[[Expo app open error]]`, marked the Kickstarter plan's device-testing blocker resolved.
- Fixed the last UTC date bug in `ai-chat/index.ts` (`todayKey()` → `localDateKey(tzOffsetMinutes)`).

### P1 — Nav restructure (task 078, resolved: enforce the 5-tab plan)
Collapsed 7 tabs + ~10 header icons down to the canonical 5 (Today/Habits/Health/Fitness/Life) that `system-model.md` always specified.
- New `app/(tabs)/health.tsx` and `life.tsx` — pure card-grid hubs, each card `router.push`es an existing screen, zero new business logic. Gave the `life` AI companion its first reachable entry point.
- `gym.tsx` retitled BODY→FITNESS, gained a RECORD ACTIVITY button and a working progress-chart icon (previously dead).
- `tree.tsx` deleted (its `bonsai` table was dropped from prod on 07-06 — the tab could never have worked).
- `activity`/`progress`/`profile` kept registered with `href: null` — still reachable via `router.push`, just no tab-bar slot, so none of their working internals needed touching.
- Today's header cut from ~10 icons to 4 (search/calendar/profile/settings); sign-out moved to Profile; bluetooth moved to Settings → Connected Devices.
- Verified every formerly-icon-reached route still has a live path. `tsc`/`vitest` unchanged from baseline.

**Not verified on-device** — routing-only, no data risk, but still needs a real device pass like everything else in this build.

### P2 — SharedContext + de-siloing (code done, deploy pending — see above)
The headline fix from the audit: `buildContext.ts` previously only had per-companion `contextSources` plus precomputed boolean flags. Ask the gym companion "how many calories today?" and its context had zero meal rows.

- **B1**: new SharedContext block runs for *every* companion regardless of its own `contextSources`, appending `SHARED (today): calories X/Y · protein X/Yg · sleep Xh · tomorrow: leg day · steps X · focus Xm this week · water X.XL`. Reuses data a companion already fetched where possible.
- **B2**: new `daily_steps` table (migration 029, **applied live**) + fire-and-forget upsert from `lib/body-data.ts`'s Apple Health merge path. Steps were local-only before this; no AI could ever see a step count.
- **B3**: new `lib/focus-data.ts` — `app/focus-timer.tsx` now writes `focus_sessions` + calls `postWrite('focus', …)` on every completed work interval. Previously only the device wrote this table; the app-side timer never did. Also wired a `focus_sessions` buildContext handler and added `'focus'` to `postWrite`'s Entity union (increments `cumulative_stats.total_focus_secs`).
- **B4**: implemented `remember_about_user` in `actionExecutor.ts` — appends a deduped, size-capped bullet to `user_context_summary.assistant_notes_md`. Previously nothing ever wrote that column despite `buildContext` rendering it as "NOTES YOU'VE SAVED" — the AI could not remember anything a user told it to.
- **B5**: wired the previously-dead `water_logs` handler into the SharedContext block (real data, just never read by any companion before).

## What's still open

Per the fix plan, in order:
- **P3 — companion roster**: add `medication`/`finance`/`library` companion configs (screens already exist, config-only, ~10 lines each). Rides on the same `ai-chat` redeploy as P2.
- **P4 — postWrite integrity**: `lib/library-data.ts` never calls `postWrite`; `deleteMeal()` skips it; `lib/body-data.ts`'s water/weight writes bypass it despite the `Entity` union advertising support.
- **P5 — vault loop**: the Mac vault agent is built but never started (no launchd job loaded); `vault_files` is empty; the "second brain" grounding feature is silently inert.
- **P6 — EAS dev build + device pass**: nothing in this app has been run on a real device since the 07-07 screen-split pass. This is the actual verification gate for P0-P5's work, plus onboarding (the riskiest change of that session), background GPS, camera→food-vision, HealthKit, BLE bridge.

Also open, not part of this plan: `save-api-key` needs its first deploy (P0 finding).

## Standing rules (unchanged)
- Never `supabase db push` — re-runs the unsafe `002_date_key_format.sql`.
- Never deploy uncommitted code — commit first, always.
- Migration numbers in task files are hints; check `ls supabase/migrations/` before naming a new one.
