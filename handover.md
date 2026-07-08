# handover.md — start here

> Fresh hand-off, written 2026-07-08 (later the same day as the market-ready build handover).
> Supersedes that one — `git log handover.md` to read it; its firmware/app code summary is still
> accurate, only its "not deployed" status is now stale.
> Second Brain: this session's full log is
> `~/esp/SecondBrain/Conversations/2026-07-08-migrations-and-deploys-live.md`.

## 30-second orientation
Everything the previous handover flagged as "written/committed but not deployed" **is now live**:
migrations 026–028 applied, and `device-state`/`tts`/`daily-briefing` deployed for the first time
ever (they weren't just "pending a redeploy" — they had never been deployed), `ai-chat` redeployed
with the vault-context fix. The `firmware` Storage bucket exists (public, for OTA). **The device
itself is still unplugged and hardware-unverified** — nothing in this session touched firmware or
a physical device. The three files documenting this session's Supabase changes are now
**committed locally but NOT pushed to origin** — push before starting new work, or a fresh clone
still won't reproduce the running system.

## Read in this order
1. `system-model.md` — canonical architecture, wins every conflict.
2. `database.md` — schema reference.
3. `current-state.md` — NOTE: still not updated for the device surface (stale since 2026-07-07).
   This handover + the two 07-08 Second Brain logs are the accurate record.
4. This file.

## ⚠️ Do this first: push to origin
This session ran Supabase-side changes (migrations, deploys) first, then committed the three
files documenting them **locally** — they are NOT yet pushed:
- `supabase/migrations/APPLIED.md` (modified — now shows 28/28 migrations live)
- `supabase/functions/daily-briefing/deno.json` (new — see below, required for the function to boot)
- `supabase/migrations/028_firmware_storage.sql` (new — written after-the-fact to match what was
  actually applied)

Run `git push` before starting new work. Until pushed, this is still the "uncommitted code
running in production" gap the 2026-07-06 audit flagged — committed-but-unpushed is the same
blind spot for anyone who clones fresh from origin instead of pulling this local repo.

## What happened this session
- **Authenticated the Supabase MCP** (OAuth, browser flow) — this is what got past the auto-mode
  production-deploy classifier that blocked deploys for two prior sessions. If you hit
  `{"message":"Unrecognized client_id"}`, the authorization link is stale — re-run `authenticate`
  for a fresh one, don't retry the same URL.
- **Migrations 026 (`focus_sessions`) + 027 (`vault_inbox`) applied**, confirmed live via direct
  table queries. Also found `025_meal_photo_storage.sql` was already live but unmarked in
  `APPLIED.md` — the ledger had drifted from reality; fixed.
- **`028_firmware_storage.sql` written and applied** — public `firmware` Storage bucket (public
  read policy, service-role-only write policy) so the ESP32 can fetch OTA manifests/binaries
  without needing to authenticate first (it can't — the update check happens pre-login). This
  needed an explicit user confirmation (auto-mode blocks all new public-bucket creation by
  default) — user reviewed a plain-language explainer and approved.
- **Deployed `device-state`, `tts` for the first time** (checked `list_edge_functions` first —
  they had genuinely never been deployed, contrary to how the prior handover read).
- **Deployed `daily-briefing` for the first time** — but it was missing `deno.json` (an import
  map for its bare `@supabase/supabase-js`/`@anthropic-ai/sdk` specifiers), which `ai-chat`/
  `device-state`/`tts` all had and it didn't. Without this it would have failed to boot on
  deploy. Created the file (matches `ai-chat`'s import map) before deploying.
- **Redeployed `ai-chat`** (v21→v22) — picks up the vault contextSource fix from the market-ready
  build session.
- **Anthropic key rotation confirmed done** by the user (was open since 06-29) — no longer a
  follow-up item.

## Immediate priorities, in order
1. **Commit the three uncommitted files** listed above.
2. **EAS dev build** of the app (BLE pairing needs it; no new native deps were added the prior
   session).
3. **Start the vault agent** on this Mac: `cd tools/vault-agent && npm install &&
   HABIT_USER_EMAIL=… HABIT_USER_PASSWORD=… npm start` (launchd plist included for persistence).
4. **When the device is plugged in**: first reflash MUST be `idf.py erase-flash flash` (partition
   table changed for OTA), then run `~/esp/projects/companion-hud/docs/SMOKE-TEST.md` top to
   bottom. IMU gesture thresholds/axis signs in `buttons.c` will need on-hardware calibration.
5. **`current-state.md` refresh** — still stale since 2026-07-07; low urgency since this handover
   + both 07-08 Second Brain logs cover the gap, but worth doing once the device surface is
   hardware-verified rather than before.

## Known follow-ups deliberately not done (unchanged)
- MITM-protected pairing (numeric-comparison popup on the round display); SYNC/ACTION BLE chars
  are not encryption-gated yet (provisioning char is).
- BLE-relayed TTS (Wi-Fi-only for now); flash encryption / secure boot; embeddings vault search
  (FTS only); multi-user vault agent (hardcoded to this Mac); IMU deep-sleep wake.
- Everything from the 07-07 handover's follow-up list (confidence-gate rewrite, genId
  consolidation, nav restructure decision, wiring focus/life companions into in-app chat).

## Working rules (unchanged)
- One task per session; verify → update `current-state.md` → commit + push specific files.
- `ls supabase/migrations/` before naming a new migration (next is 029).
- Every domain write goes through `lib/postWrite.ts`.
- Nothing deploys unless the exact files are committed to git first — **this session broke that
  rule under direct user instruction to run the deploys immediately; the fix (commit now) is
  priority 1 above.**

## Copy-paste prompt to start the next session
```
Read handover.md in ~/esp/habit-tracker, then system-model.md and current-state.md. Migrations
026-028 and the device-state/tts/daily-briefing/ai-chat deploys are all live on Supabase as of
2026-07-08, but three files documenting that are still uncommitted — commit them first. Then
either help me start the EAS dev build / vault agent, or — if the device is plugged in — start
the smoke test at ~/esp/projects/companion-hud/docs/SMOKE-TEST.md (first flash must be
erase-flash). Tell me if something needs me first.
```
