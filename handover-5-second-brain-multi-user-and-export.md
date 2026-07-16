# Handover 5 — Second Brain multi-user rearchitecture + one-click Export; P0-P5 (code) all done

Session: 2026-07-15/16. Continued from handover-4: deployed the two pending Edge Functions, shipped P3 (companion roster) and P4 (postWrite integrity) from the Code Audit v2 fix plan, then did a full rearchitecture of P5 ("the vault loop") after the user asked how the second brain would actually work for real users.

## Priority #1 next session: get this on a real device

Nothing shipped this session has touched a physical device. `tsc`/`vitest` are clean and every deploy that needed one happened, but the actual proof any of this works is a real device pass:
1. Companion chat smoke test (from handover-4, still outstanding): ask the activity companion a calorie question, ask focus "how much did I focus this week?" — confirms P2's SharedContext is live (it is — `ai-chat` v23).
2. **New this session**: log a task, a meal, complete a habit, tick a goal milestone, log a workout, finish a book/movie — then check Supabase (`vault_files` table) that a row landed with sane `path`/`content`. Then tap Settings → "Export to Obsidian," confirm the share sheet opens with a valid `.zip`, unzip it, and **actually open the folder in the real Obsidian app** to confirm it renders as a working vault. That's the only test that proves phase 1+2 work end to end — everything before it is just "a query ran."

## What shipped this session

### Two pending deploys closed (blocking items from handover-4)
- **`ai-chat` → v23**: P2's SharedContext work (cross-domain calorie/sleep/steps/focus/water block, `remember_about_user`, timezone fixes) is now live. Deploy required an explicit human "yes go ahead" — a generic "continue" was blocked twice by the auto-mode classifier, confirmed again this session as standing behavior, not a fluke.
- **`save-api-key` → v1**: its first-ever deploy. The Settings BYOK toggle now works end to end (storage side deployed, consumption side — `ai-chat`'s `getUserApiKey()` — was already live).

### P3 — companion roster (code done, needs its own `ai-chat` redeploy)
Added `medication`/`finance`/`library` companion configs (Vital/Ledger/Stacks) to `_shared/companions.ts` + matching `buildContext.ts` data blocks over `medications`+`medication_logs`, `expenses`+`bills`+`budgets`, `books`+`movies`+`saved_links`+`ideas`. 12 companions total now. **Committed (`d549057`) but this commit postdates the `ai-chat` v23 deploy** — not live yet, needs its own redeploy whenever requested.

### P4 — postWrite integrity (committed `0d25fa4`)
Three known gaps closed: `lib/library-data.ts`'s `setBookStatus`/`markWatched` now call `postWrite`, so `cumulative_stats.total_books_finished`/`total_movies_watched` can finally increment; `deleteMeal()` now calls `postWrite(..., 'delete')` (known gap since handover-3); `lib/body-data.ts`'s `addWater`/`logWeight` now actually call `postWrite` despite `'water'`/`'weight'` having been in the `Entity` union unused the whole time.

### P5 — full rearchitecture (both phases done in code, this is the big one)

User asked directly how the second brain would work for real, multiple users — not just the developer. Investigation found `current-state.md`'s "P5: start the Mac vault agent" framing was wrong: `tools/vault-agent` is a Node script hardcoded to **one email/password and one local folder path**, useful as a dev/debug tool, structurally incapable of serving more than one person. The real designed path (live iCloud↔Obsidian sync, tasks 056/059) is 100% unbuilt and gated behind an Apple entitlement + EAS device build — both slow-clock blockers already known elsewhere in this project — and implicitly assumes users pay for Obsidian Sync.

Planned and built a two-phase replacement instead (full design + context: `SecondBrain/Projects/Habit Tracker/Features/Obsidian Second Brain Sync.md`, rewritten this session; plan file at `/Users/nova/.claude/plans/how-am-i-going-memoized-ember.md`):

**Phase 1 — server-native vault notes.** `lib/obsidianNotes.ts` (pure) + `lib/obsidian.ts` (Supabase I/O) give `postWrite`'s `writeObsidian()` a real body — writes AI-readable markdown straight to `vault_files`, no filesystem/iCloud/Obsidian involved, works for every user immediately. Scope: task/meal → the day's Daily Note (idempotent via an `<!--id:...-->` line marker), habit → rolling per-habit log, workout/goal/book/movie → one file each. Sleep/mood/water/weight/medication/focus/activity/expense deliberately skipped — already fully captured elsewhere. Deletes soft-delete via the existing `deleted_at` column. Had to backfill `date`/`name`/`title` onto several `postWrite()` call sites that only ever passed bare ids (`lib/actionExecutor.ts`'s 3 task cases, `lib/habits-data.ts`, `lib/goals-data.ts`, `lib/workout-data.ts`, `lib/library-data.ts`) — all cheap local lookups, zero new network calls. 32 new vitest cases, pure-logic only (split into its own file specifically so importing it doesn't pull in react-native's Flow syntax via `./supabase`, same issue hit in the 2026-07-09 session).

**Phase 2 — "Export to Obsidian" (one-click .zip).** User's own idea, mid-plan-review: instead of a live iCloud round-trip, just let users export a real `.zip` of `.md` files and import it into Obsidian manually — free, no entitlement, no Obsidian Sync subscription. `lib/obsidianExport.ts`: fetches the user's `vault_files` rows, builds the zip via `jszip` (pure JS), writes it via `expo-file-system`'s SDK 54 `File`/`Paths` class API (checked against the installed `.d.ts`, not assumed — `write()` takes `string | Uint8Array` directly, no base64 step needed), shares via `expo-sharing`. New Settings section ("SECOND BRAIN") with the export button. New deps: `jszip`, `expo-sharing`. One-shot snapshot export, not live sync — the explicit, deliberate trade for zero cost.

**Phase 3 (deferred, not built)**: the original live iCloud+Obsidian round-trip, kept in the rewritten spec doc as an optional future power-user layer, not required to ship.

Housekeeping done alongside: `tasks/058-lib-obsidian.ts-real-writer.md` updated to describe the phase split and its revised (narrower) acceptance criteria; `lib/featureFlags.ts`'s `obsidianSync` flag comment clarified to say it gates phase 2/3's UI only, not phase 1's writer (which runs ungated for everyone); `current-state.md`'s P5 section rewritten twice (once per phase).

## What's still open

- **`ai-chat` redeploy for P3** — companion roster code is committed but not live. Needs its own explicit "deploy ai-chat" instruction (a generic "continue" won't clear the classifier — confirmed pattern, now 3 times across sessions: `ai-chat` ×2, `daily-briefing` ×1, `save-api-key` ×1).
- **P6 — EAS dev build + full device pass**: unchanged from handover-4, now also covers everything from P5. Nothing in this app has touched a real device since 07-07.
- **Phase 3** (live iCloud/Obsidian sync) — deliberately deferred, not urgent; phases 1+2 already give every user a working, free second brain.
- Kickstarter/business track (Ltd + bank account, certs, BOM/manufacturing) — untouched this session, per handover-4's last status.

## Standing rules (unchanged)
- Never `supabase db push` — re-runs the unsafe `002_date_key_format.sql`.
- Never deploy uncommitted code — commit first, always.
- Migration numbers in task files are hints; check `ls supabase/migrations/` before naming a new one.
- **Every production deploy needs its own explicit, specifically-named instruction** — a plan doc, a prior approval, or a generic "continue"/"yes" does not clear the auto-mode classifier. Confirmed repeatedly across this and prior sessions; treat it as permanent, not a bug to work around.
