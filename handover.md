# handover.md — start here

> Fresh hand-off, written 2026-07-08 after the Companion HUD market-ready build session.
> Supersedes the 2026-07-07 migrations-live handover (committed just before this one —
> `git log handover.md` to read it; its migration/RPC context is still accurate).
> Second Brain: this session's full log is
> `~/esp/SecondBrain/Conversations/2026-07-08-companion-hud-market-ready-build.md`.

## 30-second orientation
Local-first React Native (Expo SDK 54) app, Supabase backend, one config-driven AI companion
layer. All 24 original migrations are live (07-07 session); **two new ones (026, 027) are
written but NOT applied**. The big change this session: the **Companion HUD ESP32 device**
(`~/esp/projects/companion-hud`) went from a 2-real-tab demo to a code-complete market-ready
surface — all 8 device pages wired to real backends through a new `device-state` Edge Function,
Wi-Fi standalone mode with in-app pairing, spoken answers (TTS), voice capture into the
Obsidian vault, and OTA. **None of it is hardware-verified: the device was unplugged all
session.** Everything builds (`idf.py build`, `tsc` clean for touched files) and is committed
on both repos.

## Read in this order
1. `system-model.md` — canonical architecture, wins every conflict.
2. `database.md` — schema reference.
3. `current-state.md` — NOTE: not updated this session; this handover + the Second Brain log
   are the accurate record for the device surface. App-side state in it is still valid.
4. This file.

## What just happened (2026-07-08, this repo)
- **`supabase/functions/device-state/`** (new): GET → compact JSON snapshot (today's tasks,
  habits+streaks, gym plan/check-in, last run + week km, hub next-event, brain stats);
  POST `{actions:[…]}` → `complete_task`, `toggle_habit`, `gym_checkin` (sentinel template
  `device-checkin`), `log_focus_session`, `capture_note`. JWT-auth'd, tz-aware.
- **`supabase/functions/tts/`** (new): Groq PlayAI proxy (reuses `GROQ_API_KEY`), JWT-gated,
  streams WAV. The device speaks answers through it in Wi-Fi mode.
- **Migrations `026_focus_sessions.sql` + `027_vault_inbox.sql`** (new, ⚠️ NOT applied).
- **`_shared/buildContext.ts`**: new optional `userMessage` param + `vault` contextSource —
  FTS top-3 snippets from `vault_files` ranked against the message. Wired into `habitCoach`
  and `life` in `_shared/companions.ts`; `ai-chat/index.ts` passes the message through.
  ⚠️ This means **`ai-chat` needs a redeploy** (on top of the already-pending one from 07-07).
- **`lib/ble-bridge.ts`**: relays device-state snapshots to the ESP32 (on connect / 60s /
  tasks Realtime) as chunked writes; relays device JSON actions back to device-state; routes
  vault captures ("note …" or device capture mode) to `capture_note`; maps the device's
  active tab to a companionType (`ask_context`).
- **`app/pair-device.tsx`** (new): pairing flow — BLE connect → home Wi-Fi creds → account
  password mints a **separate, revocable device session** (raw password grant, doesn't touch
  the phone's session) → single encrypted TLV write provisions the device for standalone mode.
- **`tools/vault-agent/`** (new): Node daemon syncing `~/esp/SecondBrain` → `vault_files`
  (chokidar, hash-skip, soft-delete) and `vault_inbox` → `Inbox/*.md` notes. launchd plist
  included. Run: `cd tools/vault-agent && npm install && HABIT_USER_EMAIL=… HABIT_USER_PASSWORD=… npm start`.

## What happened in the firmware repo (`~/esp/projects/companion-hud`)
Five commits (f9831f42 → c6ac7807): RTC (PCF85063) + IMU (QMI8658, runtime-probed, raise-to-
wake / flip-to-focus) drivers; OTA partition layout + `esp_https_ota` client + `tools/release_ota.sh`;
`state.c`/`sync.c` snapshot store with NVS cache + offline action queue; all 8 screens live;
`wifi.c`/`auth.c`/`net.c` Wi-Fi-direct transport (refresh-token auth with atomic rotation);
encrypted BLE provisioning char + Just Works bonding; TTS speaker streaming; BRAIN voice
capture; `docs/SMOKE-TEST.md` (the hardware verification gate — read it before trusting
anything device-side).

## Immediate priorities, in order
1. **Apply migrations 026 + 027** (SQL editor or Supabase MCP `apply_migration` — never
   `db push`), then update `supabase/migrations/APPLIED.md`.
2. **Deploy Edge Functions**: `device-state` (new), `tts` (new), `ai-chat` (redeploy — vault
   contextSource), `daily-briefing` (still pending from 07-07). All committed; deploys were
   blocked by the auto-mode production classifier two sessions running — run them by hand or
   adjust permissions.
3. **Create a public Storage bucket named `firmware`** (OTA manifest + binaries).
4. **When the device is plugged in**: first reflash MUST be `idf.py erase-flash flash`
   (partition table changed), then run `~/esp/projects/companion-hud/docs/SMOKE-TEST.md`
   top to bottom. IMU gesture thresholds/axis signs in `buttons.c` will need calibration.
5. **EAS dev build** of the app (BLE needs it; no new native deps were added).
6. **Start the vault agent** on the Mac (env creds above; launchd plist for persistence).
7. **🔁 Rotate the Anthropic key** — still open since 06-29.

## Known follow-ups deliberately not done
- MITM-protected pairing (numeric-comparison popup on the round display); SYNC/ACTION chars
  are not encryption-gated yet (provisioning char is).
- BLE-relayed TTS (Wi-Fi-only for now); flash encryption / secure boot; embeddings vault
  search (FTS only); multi-user vault agent (hardcoded to this Mac); IMU deep-sleep wake.
- `current-state.md` refresh for the device surface (this handover is the stopgap).
- Everything from the 07-07 handover's follow-up list (confidence-gate rewrite, genId
  consolidation, nav restructure decision, wiring focus/life companions into in-app chat).

## Working rules (unchanged)
- One task per session; verify → update `current-state.md` → commit + push specific files.
- `ls supabase/migrations/` before naming a new migration (next is 028).
- Every domain write goes through `lib/postWrite.ts`.
- Nothing deploys unless the exact files are committed to git first.

## Copy-paste prompt to start the next session
```
Read handover.md in ~/esp/habit-tracker, then system-model.md and current-state.md. The
Companion HUD device surface is code-complete but nothing is deployed or hardware-verified.
Confirm back to me: are migrations 026/027 applied, and are device-state/tts/ai-chat/
daily-briefing deployed? Then either walk me through the deploys, or — if the device is
plugged in — start the smoke test at ~/esp/projects/companion-hud/docs/SMOKE-TEST.md
(first flash must be erase-flash). Tell me if something needs me first.
```
