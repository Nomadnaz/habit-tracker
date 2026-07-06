# handover.md — start here

> Fresh hand-off, written 2026-07-06 after a full plan/code/AI-system audit + fix pass.
> Supersedes `NEXT-SESSION.md` (2026-06-29, stale — kept for history, don't work from it).
> Second Brain: `~/esp/SecondBrain/Projects/Habit Tracker/Habit Tracker.md` — this session's
> full log is `~/esp/SecondBrain/Conversations/2026-07-06-full-audit-and-fix-pass.md`.

## 30-second orientation
Local-first React Native (Expo SDK 54) app, Supabase backend, one config-driven AI companion layer
(9 of 14 companions configured, 7 reachable via chat). ~90 tables across ~16 domains. The lean MVP
spine is now code-complete — **nothing in this handover has been run on a device or redeployed**.
That is the single biggest open risk, not a formality.

## Read in this order
1. `system-model.md` — canonical architecture, wins every conflict.
2. `database.md` — schema reference (just amended — see "What changed" below).
3. `current-state.md` — what's built, the progress log, the "ACTION NEEDED BY YOU" section.
4. This file.
5. Then the next `tasks/NNN-*.md` per `current-state.md`'s "NEXT TASK" section.

Never load the full master spec — it's outside this repo and too large; the task files are
distilled from it.

## What just happened (2026-07-06)
Ran a 3-agent Fable 5 audit (architecture / code quality / AI companion system), then worked
through its fix list end-to-end in one session, committing and pushing after each unit. Full
detail in `current-state.md`'s progress log and the Second Brain conversation log linked above.
In short:
- Fixed a **critical streak-corrupting date bug** (UTC-vs-local mismatch) in both the client data
  layers and the server AI layer.
- Fixed an onboarding dead-end and a double-flush race.
- Added a per-key AsyncStorage mutex (`lib/storageLock.ts`), closing read-modify-write races across
  ~12 domain data layers.
- Made precomputed AI context flags actually cross domains (they couldn't before).
- Rate-limited `daily-briefing` (previously unlimited) and fixed `api_usage` token accounting
  (was overwriting instead of accumulating).
- Unlocked 6 of 9 companions that had no chat UI at all (`ChatScreen` gained a `companionType`
  prop, wired into 6 screens) — the single highest-leverage fix.
- Cleaned up `lib/streaks.ts` (was a dead-wrong generic cache) and moved a per-write summary
  regeneration out of the hot write path into `daily-briefing`.
- Wired `log_meal`, BYOK key consumption, and `companion_personas` names into `ai-chat` — three
  things that were stored but silently never used.
- Removed a misleading confidence-percentage display from the chat UI; hardened two action
  executors against silently-no-op'd hallucinated task IDs.
- Wrote `tasks/078-nav-restructure.md` (records the 7-tab-vs-5-tab drift, doesn't fix it) and
  amended `database.md`'s schema rules.

## What changed in the canonical docs
- **`database.md`**'s "CANONICAL RULES" section now explicitly documents why date columns stay
  `TEXT` (not native `DATE`) and flags — without fixing — that 13 files duplicate a weak `genId()`.
  Read this before creating any new table.
- **`CLAUDE.md`** gained a "Never deploy uncommitted code" rule after finding the live `ai-chat`
  function had gone uncommitted since 2026-06-29.
- **`supabase/migrations/APPLIED.md`** is new — the real ledger of what's actually live in
  production. Trust this over prose anywhere else for "has this migration run" questions.

## Immediate priorities, in order
1. **Run the outstanding migrations** — `current-state.md`'s "ACTION NEEDED BY YOU" section has
   the exact ordered list (`002` through `024`); some are one-shot or have hard dependencies
   (`024` must run before `ai-chat`/`daily-briefing` will work at all, since both now call RPCs it
   defines).
2. **Redeploy `ai-chat` and `daily-briefing`** — both have accumulated fixes this session
   (timezone bug, rate limiting, BYOK, log_meal, personas) that aren't live yet.
3. **On-device verification, starting with onboarding.** It rewrites the auth-entry routing and
   is the single riskiest unverified change in the whole backlog. `current-state.md`'s
   "On-device verification" section has a full checklist once you're on a device — work through it
   in order, onboarding first.
4. **Decide the nav restructure** (`tasks/078-nav-restructure.md`): enforce the 5-tab plan or
   formally revise `system-model.md` to match the shipped 7-tab reality. Either is fine; the task
   file exists so this gets decided once instead of drifting further.

## Known follow-ups that were surfaced but deliberately not done
- Confidence-gate architectural rewrite (numeric float → categorical intent labels) — flagged as
  too large to do safely in one blind pass; needs prompt-format changes across every companion.
- Consolidating 13 duplicate `genId()` implementations into one `crypto.randomUUID()`-backed
  helper (`database.md`'s rules section flags this; not yet a numbered task).
- Wiring `focus` and `life` companions into chat (no distinct screen for `life` yet; `focus` is
  large and orientation-sensitive — didn't want to edit it blind).
- The nav restructure itself (see priority 4 above — only the decision-record exists).

## Working rules (from CLAUDE.md, still current)
- One task per session; enrich → implement → verify (`tsc`) → update `current-state.md` → commit
  + push the specific files changed.
- Migration numbers in task files are hints, not guarantees — always `ls supabase/migrations/`
  before naming a new one.
- Every domain write goes through `lib/postWrite.ts` — never touch `cumulative_stats`, badges,
  friend-feed, or Obsidian directly from a screen.
- Nothing gets deployed — no `supabase functions deploy`, no migration pasted into the SQL
  editor — unless the exact files are committed to git first.

## Copy-paste prompt to start the next session
```
Read handover.md, then system-model.md, database.md, and current-state.md in the habit-tracker
repo (~/esp/habit-tracker), in that order. Confirm the current state back to me — especially
which migrations still need running and whether ai-chat/daily-briefing have been redeployed —
then let's start with on-device verification of onboarding, or tell me if something needs me
first.
```
