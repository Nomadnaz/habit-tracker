# Task 061: Daily profile-note generation

**Phase:** 7 — Obsidian Sync
**Status:** done (2026-07-16, code only — not yet deployed, see note)
**Depends on:** 019,059

## Goal
Extend daily-briefing to also generate profile_md (rolling profile note with computed trends) alongside the existing briefing text.

## Key files
supabase/functions/daily-briefing/index.ts (extended)
supabase/functions/_shared/trends.ts (new — pure, vitest-tested)

## Acceptance criteria
- [x] profile_md includes at least one computed trend (e.g. 'sleep trending down 3 weeks'), not just a snapshot — `computeSleepTrend()` in `_shared/trends.ts` compares avg sleep over the most recent ~7 logged nights vs the ~7 before that (count-based windows, not calendar-day windows — robust to gaps in logging), returning "trending up/down" or "steady" text, or `null` when either window has fewer than 4 real nights (never fabricates a trend from sparse data). Wired into `updateUserContextSummary()`'s `profileMd` via a dedicated 14-day `sleep_logs` query (not reused from `ctx.raw.sleep_logs`, which is windowed to only 7 days by `buildContext.ts`'s own SLEEP block — too narrow for a recent-vs-prior comparison). 6 new vitest cases in `_shared/trends.test.ts`.
- [x] Journal/therapy content never quoted in the generated profile note — trivially satisfied, same reasoning as this task's sibling `search_vault` criterion in tasks/060: `updateUserContextSummary()` never queries `journal_entries`/`therapy_notes` at all.

**Note:** `daily-briefing` needs its own redeploy for this to go live — code committed, not deployed, per the standing "every production deploy needs its own explicit instruction" rule (same as task 060's re-summarization, which also lives in this function — both ship together in one redeploy whenever requested).

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
