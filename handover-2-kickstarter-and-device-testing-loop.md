# handover 2 — kickstarter and device testing loop

> Written 2026-07-09. Does NOT supersede `handover.md` — that one is still the accurate record
> for Supabase/deploy state (migrations 026–028, `device-state`/`tts`/`daily-briefing` deploys,
> `ai-chat` v22). This handover adds a second, parallel track: the business/Kickstarter launch
> plan, plus a new blocker on the device-testing loop that surfaced today.
> Second Brain: `~/esp/SecondBrain/Projects/Puck AI/Kickstarter Launch Plan.md` (canonical,
> living) and `~/esp/SecondBrain/Conversations/2026-07-09-kickstarter-launch-roadmap.md`
> (session log). Claude memory: `puck-ai-kickstarter-launch-plan.md`.

## 30-second orientation

Today's session opened a new track: turning this project into a company and a Kickstarter
campaign ("Puck AI" — public name, not yet locked; code still says "Companion HUD"/
"habit-tracker"). Produced a 6-phase launch roadmap. Two of six phases moved:

- **Compliance (Phase 02)** — user reports required certifications now obtained. Exact scope
  (UKCA/CE / UN38.3 / WEEE / FCC) not itemized yet, confirm next session.
- **Legal foundation (Phase 01)** — UK Ltd sign-up **in progress**, business bank account
  application **in progress**. Neither complete.

**Phase 00, hardware verification, is still not done — and now has a new blocker**: the Expo
app throws an error on open. This blocks the device-testing loop entirely, since the app is the
BLE bridge the Companion HUD device depends on (pairing, sync, OTA). Nothing else in the
hardware/device track can proceed until this is fixed.

## Read in this order

1. `handover.md` (this repo) — still-accurate Supabase/deploy state.
2. `~/esp/SecondBrain/Projects/Puck AI/Kickstarter Launch Plan.md` — canonical business/launch
   status board, all 6 phases, cost/timeline table, open decisions.
3. This file — the device-testing-loop blocker and immediate next step.

## The device testing loop (currently broken)

Intended loop, once Phase 00 unblocks:
```
EAS dev build / expo start → app opens clean → BLE pairs to device →
erase-flash reflash (idf.py erase-flash flash — partition table changed) →
docs/SMOKE-TEST.md top to bottom (companion-hud repo) → IMU/gesture calibration on real hardware
```
**Currently stuck at step 1**: the app throws an error on open. No error message or repro steps
were captured this session — first thing to do next session is get the actual error text/stack
trace (run `npx expo start`, reproduce, paste the exact output) rather than guessing at causes.
Plausible starting points given recent history: uncommitted/unpushed Supabase-side changes from
`handover.md` (three files listed there as committed-locally-but-not-pushed — confirm they're
pushed), or a native-dependency mismatch if no EAS dev build has been run since BLE bridge code
landed (`handover.md` priority 2, never confirmed done).

## Kickstarter track — where it stands

Full detail lives in the vault doc; summary:

| Phase | Status |
|---|---|
| 00 Hardware verification | Not done — blocked on Expo app error (see above) |
| 01 Legal foundation | In progress (Ltd + bank account both mid-application) |
| 02 Compliance & certification | User reports done — confirm exact scope |
| 03 Manufacturing / BOM / enclosure | Not started — no costed BOM or enclosure design exists |
| 04 Campaign build | Not started — blocked on 00/01/03 |
| 05 Launch & fulfillment | Not started |

Non-obvious things worth not re-learning: a module's existing FCC/CE cert (e.g. Espressif's
ESP32-S3) only covers the RF portion in its tested config, not the assembled end product — EMC
+ RF-exposure/SAR testing of the whole device is still separately required since it's worn/
handheld. UN38.3 battery certs aren't transferable between suppliers — buying an
already-certified pack from a reputable supplier is the cheap path, not independent lab testing.

## Immediate priorities, in order

1. **Get the Expo app error** — exact message/stack trace, how it was triggered (fresh
   `expo start`? EAS build? specific screen?). This is the actual critical-path blocker right
   now, ahead of anything Kickstarter-related.
2. Once the app opens clean, resume the device-testing loop above — first reflash MUST be
   `idf.py erase-flash flash`, then `docs/SMOKE-TEST.md`.
3. Confirm Ltd + bank account completion status.
4. Itemize which certifications from Phase 02 are actually in hand.
5. Start Phase 03 (BOM, enclosure/industrial design, manufacturing quotes) — currently the
   least-started track and needed before Phase 04 campaign build can begin.

## Copy-paste prompt to start the next session

```
Read handover-2-kickstarter-and-device-testing-loop.md in ~/esp/habit-tracker, then
handover.md, then ~/esp/SecondBrain/Projects/Puck AI/Kickstarter Launch Plan.md. The Expo app
is throwing an error on open — that's the current blocker, ahead of anything else. Help me
capture the exact error and fix it so I can get back to the device-testing loop (reflash +
SMOKE-TEST.md). Separately, UK Ltd + bank account are both mid-application — I'll update you on
their status.
```
