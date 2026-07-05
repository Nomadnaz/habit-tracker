# Task 065: Finance tracker (manual)

**Phase:** 8 — Polish
**Status:** implemented (2026-07-05) — pending live migration run + on-device verify
**Depends on:** 013

## Goal
FUTURE. app/(tabs)/finance.tsx — Spending/Bills/Budgets tabs, manual entry only. Bank connection stays with task 051.

## Key files
app/modals/finance.tsx (NOT a tab — see notes), lib/finance-data.ts (new), supabase/migrations/018_finance.sql (`017` was taken by Goals this session)

## Acceptance criteria
- [x] Manual expense/bill/budget logging works without any bank connection — `expenses`/`bills`/`budgets` tables, all written directly by the client; `bank_connections` intentionally not created (task 051).
- [x] Over-budget alerts trigger at the right threshold per category — `budgetStatus()` in `lib/finance-data.ts` flags `over: true` when a category's month-to-date spend exceeds its budget target; the BUDGETS section renders that figure in red.

## Notes (2026-07-05)
- Not a tab — same reasoning as Settings/Sleep/Goals this session: an 8th tab bar entry would be excessive, and system-model.md's nav decision doesn't call for a Finance tab. Built as a modal with an internal Spending/Bills/Budgets segmented toggle (same pattern as the Habits/Medication toggle), reachable via a new cash icon on the Today header.
- The Today header now has 7 icons (calendar, calorie, bluetooth, goals, finance, settings, logout) — genuinely getting crowded. Not fixed here (an overflow menu or a dedicated hub screen would be the real fix) — flagging it rather than letting it silently accumulate unnoticed.
- tsc clean.  Not run live or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
