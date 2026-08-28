# Handover 8 — rep sensor + voice logging (2026-08-26 → 08-28)

> Read `system-model.md`, `database.md`, `current-state.md` first, as always.
> Firmware side: `~/esp/projects/companion-hud/docs/rep-sensor-concept.md`.

## What changed at the concept level

The ESP32 device stopped being a wrist-worn mirror of this app. It is now a
**magnetically mounted gym instrument + voice logger**: stick it to a cable
stack, dumbbell end, or bench-press bar; it counts reps and measures range of
motion live, and you can talk at it to log anything.

**Unifying rule: the user speaks the load, the device measures the motion.**
There is no force sensor, so kg is always spoken; reps/ROM/velocity/tempo are
measured.

## Phase 1 — rep measurement: DONE, verified on hardware

18/18 reps counted across deliberately varied speed (peak 0.44–1.06 m/s) and
range (13.8–34.8 cm). Firmware commits `ed986664`, `c4be9355`, `a31304cb`,
`5628716a` in `companion-hud` (that repo has **no git remote** — nothing is
pushed anywhere).

**ROM accuracy is still NOT validated.** Hand-waved on a desk, never against a
tape measure on real equipment. The out/return asymmetry noted in the concept
doc is unexplained. Treat centimetres as indicative; trust the rep count.

Four bugs, all found only by running it, none visible to a compiler:
1. `calibration_reset()` wiped the stillness window it was called from →
   window refilled to one sample forever → countdown never started.
2. Stillness compared **raw gyro magnitude** to a threshold, but a stationary
   MEMS gyro reads its bias (0.15 rad/s here). Judge **variation**, not
   magnitude.
3. Rep detection asked the **doubly-integrated position** whether the weight
   had returned. Integration drifts, so it never had. Count **turnarounds** —
   a sign change survives any slowly-varying offset.
4. `orientation_step()` integrated the gyro and **never corrected from the
   accelerometer**. Documented as a complementary filter; only the prediction
   half existed. Fixed twice: the first correction was gated on low
   acceleration, which disabled it during exactly the vigorous reps that
   needed it. **Correct toward a ~2s time-average of the accelerometer,
   ungated** — over a rep the motion cancels and gravity remains.

Device nav is now **3 tabs (HUB/LIFT/ASK)**, bezel ring and segment arcs
removed, active tab indicated by its label alone.

## Voice logging — built, deployed, NOT yet proven end-to-end

`device-log` Edge Function (**v2 ACTIVE**): one utterance → N structured writes,
executed server-side, returns what landed. Uses structured outputs
(`output_config.format` + `messages.parse`), not ai-chat's `<action>`-tag regex
scraping. **Pinned to `@anthropic-ai/sdk ^0.122`** — the project-wide `^0.40`
predates structured outputs; `ai-chat` deliberately left on `^0.40`.

Both bridges route through it first and fall back to `ai-chat` on
`handled: false` — `lib/ble-bridge.ts` and `companion-hud/tools/phone_sim.py`.

**Three independent faults were found on hardware, each masking the next:**
1. Nothing called `device-log` — the hold button still hit `ai-chat`, which
   correctly said it couldn't add foods (it gates rather than executes).
2. `habitCoach` (= `DEFAULT_COMPANION`, what the device gets) had **no logging
   actions at all** — only task verbs. `log_meal` existed but only on the
   `calorie` companion, which the device never selects. **That is why tasks
   added and calories didn't.** Fixed in `ai-chat` **v24**.
3. The write then succeeded and was **still invisible**: every `lib/*-data.ts`
   layer is local-first and was **push-only**. `tasks` is the only table in the
   `supabase_realtime` publication — the whole reason it alone worked.

Fix for (3): pull-on-focus per domain — `pullRemoteMeals`, `pullRemoteBody`
(water+weight), `pullRemoteHabitLogs`, `pullRemoteSleep`, `pullRemoteMood`.
See `habit-tracker-local-first-down-sync` in the assistant's memory for the
per-domain dedup keys — they differ, and getting one wrong double-logs.

## Deploy / build state

- `ai-chat` **v24** — habitCoach logging fix **+ P3** (medication/finance/
  library companions, committed `d549057` in July, undeployed until now). If a
  companion misbehaves after 2026-08-28, P3 is the first suspect.
- `device-log` **v2** — new.
- **No migrations were needed** for any of this; all target tables were live.
- EAS **build 10 (v1.0.0)** built and auto-submitted to App Store Connect on
  2026-08-28, carrying the app-side changes (device-log routing + all five
  down-syncs). Build ID `5fbe9ff9-a71e-48da-807c-705f3a526876`. Anything before
  build 10 does NOT have them — a tester on build 9 or earlier will still see
  `ai-chat` answering and server-written rows staying invisible.

## What is genuinely unverified

1. **ROM accuracy** — needs a tape measure on a real cable stack. Go/no-go for
   showing absolute centimetres at all.
2. **device-log parsing quality** — never exercised end-to-end. Does it really
   split "meal deal — egg and cress, coffee, protein bar" into three rows with
   sane macros? Schema is structurally validated; model behaviour is not.
3. **The down-syncs** — written and typechecked, never run on a device.

## Next: element 2 — `exercise_sets`

Reps are counted and then **thrown away**; there is nowhere to put a set.
`workout_exercises` is a template junction, `workout_done_log` is one row per
session, `pb_log` is best-weight-per-day. "6 reps of shoulder press at 20kg"
has no destination.

Needs: a new `exercise_sets` table (+ motion columns: measured reps, ROM,
velocity, tempo) and **estimated-1RM PB detection** — `log_pb` currently inserts
blindly without checking whether it *was* a PB, and with reps involved raw
weight is the wrong test (20kg×10 vs 25kg×3).

**This one needs a migration**, run in the SQL editor. **Never `supabase db
push`** on this project — it re-runs the one-time-unsafe `002`. Update
`APPLIED.md` immediately after.

## Stale things worth cleaning up

- `~/esp/habit-tracker/.env.local`'s `ANTHROPIC_API_KEY` is **dead** (real 401,
  confirmed 2026-08-28) — the June rotation follow-up. The deployed secret is
  fine; only the local file. Don't debug local scripts with it.
- `companion-hud` has **no git remote**. All firmware commits are local only.
- `sdkconfig.defaults` + the Waveshare BSP carry an **uncommitted** 2026-08-26
  root-cause fix for the long-running Wi-Fi `ESP_ERR_NO_MEM` bug
  (`CONFIG_ESP_WIFI_DYNAMIC_TX_BUFFER_NUM` was dead config; the build silently
  used 16 static TX buffers needing ~25.6KB contiguous against 23552 available).
  Not mine, still unverified end-to-end, would be a shame to lose.
