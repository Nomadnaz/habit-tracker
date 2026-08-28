# NEXT SESSION — start here

Read in this order: `system-model.md` → `database.md` → `current-state.md` →
`handover-8-rep-sensor-and-voice-logging.md`.

The device concept changed on 2026-08-26. It is no longer a wrist-worn mirror
of this app — it is a magnetically mounted gym instrument + voice logger. The
firmware spec is `~/esp/projects/companion-hud/docs/rep-sensor-concept.md`.

## Where things stand

| Piece | State |
|---|---|
| Rep counting on hardware | ✅ 18/18 verified across varied speed + range |
| ROM / centimetre accuracy | ❌ **never validated against a tape measure** |
| `device-log` (voice → many writes) | Deployed **v2**, parsing never exercised end-to-end |
| `ai-chat` | **v24** — habitCoach logging fix + P3 companions |
| App down-syncs (5 domains) | Written, typechecked, **never run on a device** |
| EAS build carrying the app changes | ✅ **build 10 (v1.0.0) submitted to TestFlight 2026-08-28** |
| `exercise_sets` (somewhere to put a set) | ❌ not started — **this is next** |

## Do this first

**1. Confirm the three unverified things**, in this order — each is cheap and
each gates work behind it:

- Voice-log a coffee, then open the calorie tab. Does it appear? (Proves the
  down-sync and the whole voice path.)
- Say a full meal deal — "egg and cress sandwich, coffee, protein bar". Does it
  log **three** items with sane macros? (Proves `device-log`, which only the
  new build can reach; `ai-chat` will only ever log one.)
- Stick the device on a cable stack, do 10 reps against a tape measure. Is the
  centimetre figure within ~5cm? (Go/no-go for ever showing absolute ROM.)

**2. Then build `exercise_sets`** — reps are currently counted and thrown away.
See handover 8's last section for exactly what's missing and why `log_pb` is
wrong today. **Needs a migration**; run it in the SQL editor, never
`supabase db push` (it re-runs the one-time-unsafe `002`), and update
`APPLIED.md` the moment it lands.

## Standing rules that bit this session

- **Never `supabase db push`.**
- **Every function deploy needs its own explicit go-ahead** — a generic
  "continue" doesn't count.
- **Nothing is deployed unless the exact files are committed first.**
- The app is **local-first**: a server-side write is invisible until that
  domain has a pull. `tasks` is the only table with realtime.
- Deploying an endpoint is not shipping a feature — **check what routes to it.**
