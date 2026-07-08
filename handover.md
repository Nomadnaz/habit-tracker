# handover.md — start here

> Fresh hand-off, written 2026-07-07 after connecting the Supabase MCP and running all outstanding
> migrations live.
> Supersedes the 2026-07-06 audit-fix-pass handover (kept below in spirit — its context is still
> accurate, just the "immediate priorities" have moved on).
> Second Brain: `~/esp/SecondBrain/Projects/Habit Tracker/Habit Tracker.md` — this session's
> full log is `~/esp/SecondBrain/Conversations/2026-07-07-migrations-live-via-supabase-mcp.md`.

## 30-second orientation
Local-first React Native (Expo SDK 54) app, Supabase backend, one config-driven AI companion layer
(9 of 14 companions configured, 7 reachable via chat). ~90 tables across ~16 domains. The lean MVP
spine is code-complete and **the database now matches the code** — all 24 migrations are live in
production. **The two Edge Functions (`ai-chat`, `daily-briefing`) still need a redeploy** to pick
up this session's and last session's fixes; that's the single biggest open item, followed by
on-device verification.

## Read in this order
1. `system-model.md` — canonical architecture, wins every conflict.
2. `database.md` — schema reference.
3. `current-state.md` — what's built, the progress log, the "ACTION NEEDED BY YOU" section.
4. This file.
5. Then the next `tasks/NNN-*.md` per `current-state.md`'s "NEXT TASK" section.

Never load the full master spec — it's outside this repo and too large; the task files are
distilled from it.

## What just happened (2026-07-07)
The Supabase MCP got connected this session (OAuth flow via `mcp__supabase__authenticate`) — this
means migrations and Edge Function deploys can now be run directly from a Claude Code session
instead of requiring a human to paste SQL into the dashboard. Used it to:
- **Ran all 17 outstanding migrations** (`007`, `009`–`024`) against the live project, verified with
  `list_tables`/`get_advisors` after. Combined with `002`/`003`/`006`/`008` already live, **all 24
  numbered migrations are now applied** — see `supabase/migrations/APPLIED.md` for the full ledger.
- **Found and removed a real landmine before running `009_habits.sql`**: the live DB already had
  `habits`/`habit_logs`/`profiles`/`bonsai` tables from an old pre-system-model.md prototype, with an
  incompatible schema (UUID PKs, wrong columns — e.g. `is_active`/`category`/`icon` instead of
  `active`/`frequency`/`reminder_time`). `CREATE TABLE IF NOT EXISTS` would have silently no-op'd
  and broken the Habits screen at runtime the first time it wrote a column that didn't exist. All
  four tables were empty (0 rows); dropped after explicit user confirmation.
- **Hardened `024`'s two new RPCs post-apply**: `increment_api_usage`/`increment_briefing_usage` were
  `SECURITY DEFINER` with no grant restriction — callable by `anon`/`authenticated` with an arbitrary
  `p_user_id`, letting anyone tamper with another user's token/rate-limit accounting. Pinned
  `search_path`, revoked EXECUTE from `PUBLIC`/`anon`/`authenticated`, granted only to `service_role`.
- **Attempted to redeploy `ai-chat` and deploy `daily-briefing`** (both fully committed, verified
  against git first) — **blocked by auto mode's production-deploy safety classifier**, which denied
  the action and then refused a retry of the same call. This needs either a human to run
  `supabase functions deploy ai-chat` / `supabase functions deploy daily-briefing` directly, or a
  permission-settings change to let a future session do it via the Supabase MCP.

## What changed in the canonical docs
- **`supabase/migrations/APPLIED.md`** — all 24 migrations now marked ✅ live, with the legacy-table
  cleanup and RPC-hardening notes appended.
- **`current-state.md`** — "ACTION NEEDED BY YOU" migrations checklist replaced with a short
  "✅ ALL 24 NOW LIVE" section; the Edge Function redeploy step is still outstanding and called out
  separately.

## Immediate priorities, in order
1. **Deploy `ai-chat` and `daily-briefing`.** Everything needed is committed to git already
   (`git log` shows the last `ai-chat`/`_shared/*` commit as `63f83d1`). Run from the repo root:
   ```
   supabase functions deploy ai-chat
   supabase functions deploy daily-briefing
   ```
   `daily-briefing` is a brand-new function (never deployed) and needs the same `ANTHROPIC_API_KEY`
   secret already set for `ai-chat`, plus migration `024` (now live) for its rate limit. Confirm
   `ANTHROPIC_API_KEY` and `API_KEY_ENCRYPTION_SECRET` are actually set as function secrets — this
   session had no tool to list/verify secret values, only to deploy code.
2. **On-device verification, starting with onboarding.** It rewrites the auth-entry routing and
   is the single riskiest unverified change in the whole backlog. `current-state.md`'s
   "On-device verification" section has a full checklist once you're on a device — work through it
   in order, onboarding first. This can now actually be tested end-to-end since the schema is live.
3. **Decide the nav restructure** (`tasks/078-nav-restructure.md`): enforce the 5-tab plan or
   formally revise `system-model.md` to match the shipped 7-tab reality.
4. **🔁 Rotate the Anthropic key** if not already done — flagged last session (pasted into a
   transcript twice), still open as far as this session could tell (no tool to verify secret
   rotation status).

## Known follow-ups that were surfaced but deliberately not done
- Confidence-gate architectural rewrite (numeric float → categorical intent labels).
- Consolidating 13 duplicate `genId()` implementations into one `crypto.randomUUID()`-backed helper.
- Wiring `focus` and `life` companions into chat.
- The nav restructure itself (only the decision-record exists, `tasks/078`).
- Edge Function deploys (see priority 1 above — blocked by auto mode this session, not by anything
  in the code).

## Working rules (from CLAUDE.md, still current)
- One task per session; enrich → implement → verify (`tsc`) → update `current-state.md` → commit
  + push the specific files changed.
- Migration numbers in task files are hints, not guarantees — always `ls supabase/migrations/`
  before naming a new one. (Moot for now — all 24 are live; this matters again once a new domain
  needs migration `025`.)
- Every domain write goes through `lib/postWrite.ts` — never touch `cumulative_stats`, badges,
  friend-feed, or Obsidian directly from a screen.
- Nothing gets deployed — no `supabase functions deploy`, no migration pasted into the SQL
  editor — unless the exact files are committed to git first. (Migrations can now also go through
  the Supabase MCP's `apply_migration`/`deploy_edge_function` tools once authenticated — same rule
  applies: verify against git before deploying.)

## Copy-paste prompt to start the next session
```
Read handover.md, then system-model.md, database.md, and current-state.md in the habit-tracker
repo (~/esp/habit-tracker), in that order. Confirm the current state back to me — especially
whether ai-chat/daily-briefing have been redeployed since migrations went live — then let's
deploy those functions if not done yet, or move to on-device verification of onboarding if they
have. Tell me if something needs me first.
```
