# Task 040: Precomputed flags

**Phase:** 4 — Cross-AI Intelligence
**Status:** implemented (2026-07-05) — pending live redeploy + on-device verify
**Depends on:** 037

## Goal
Add OVERREACHING, SLEEP_DEBT, UNDERFUELLING, LOW_PROTEIN, STRESS_SLEEP flags computed in buildContext from the live data already wired.

## Key files
supabase/functions/_shared/buildContext.ts (extended)

## Acceptance criteria
- [x] Each flag has a documented trigger condition — OVERREACHING: 6+ workouts in trailing 7 days. SLEEP_DEBT: 3+ nights under 7h in the fetched week. UNDERFUELLING/LOW_PROTEIN: trailing-3-day average calories/protein more than 30% under `nutrition_targets`. STRESS_SLEEP: SLEEP_DEBT already true AND avg `mood_logs.stress_score` ≥ 7. All documented inline in `buildContext.ts`'s flags block.
- [x] Flags appear in the context object and are referenced by at least one companion's prompt template — `raw.flags` (array) + a `FLAGS: ...` line in the text block; `BASE_PERSONA` (shared by every companion) now explains what each flag means and how to use it.

## Notes (2026-07-05)
Flags are computed from whatever `raw.*` a companion's own `contextSources` already populated — a flag never triggers an extra query beyond what was already fetched (e.g. gym's companion, which already reads `workout_done_log`, gets OVERREACHING for free; habitCoach, which doesn't read workouts, never sees it). `meals`'s query was extended to also fetch `nutrition_targets` and `protein_g` (previously not selected at all) since UNDERFUELLING/LOW_PROTEIN need both. tsc clean (same Deno-pattern baseline). Not redeployed or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
