# Task 041: Cross-domain context wiring

**Phase:** 4 — Cross-AI Intelligence
**Status:** implemented (2026-07-05) — pending live redeploy + on-device verify
**Depends on:** 040

## Goal
Calorie AI receives gym_plan/workouts; Sleep AI receives stress/HR context (stub until wearables land); all companions receive the relevant flags from task 040.

## Key files
supabase/functions/_shared/companions.ts (contextSources extended — NOT `lib/companions.ts`, which is a thin re-export, see its own header comment), supabase/functions/_shared/buildContext.ts

## Acceptance criteria
- [x] Calorie AI can answer 'what's my protein target today' factoring in tomorrow's gym_plan session — `calorie`'s `contextSources` gained `gym_plan`; new `want('gym_plan')` block in `buildContext.ts` reports tomorrow's planned session (or "a rest day"), and `meals`'s query now also fetches `nutrition_targets` so the protein figure itself is available too.
- [x] No companion silently ignores a flag that's relevant to it — flags are computed generically from whichever `raw.*` sources a companion already requested (task 040), so every companion that reads a flag-relevant source gets that flag automatically; `sleep`'s `contextSources` gained `mood_logs` as the stress/HR stub (real HR needs a wearable integration, task 048, not built).

## Notes (2026-07-05)
No changes needed to `lib/companions.ts` itself — it's already a one-line re-export of the canonical `_shared/companions.ts` (system-model.md's rule: edit `_shared/` only, never let the two diverge). tsc clean. Not redeployed or verified on-device — `supabase functions deploy ai-chat` still needed, same as task 037.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
