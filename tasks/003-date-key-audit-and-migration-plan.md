# Task 003: Date-key audit and migration plan

**Phase:** 0 — Foundation
**Status:** DONE
**Depends on:** 001

## Goal
Audit every AsyncStorage key and Supabase date column using the OLD format (YYYY-M-D, 0-indexed month) and produce a migration plan to the canonical YYYY-MM-DD (1-indexed, zero-padded, local timezone). Do not change code yet in this task — just produce the inventory.

## Key files
lib/tasks-core.ts, lib/task-schedule.ts, lib/task-supabase.ts, lib/steps-data.ts, lib/body-data.ts, lib/workout-data.ts, lib/apple-sync.ts, app/(tabs)/index.tsx

## Acceptance criteria
- [x] Written inventory of every call site using the old date format
- [x] Plan for a one-time data migration (rewrite existing AsyncStorage/Supabase date strings) vs a flag-day cutover
- [x] No code changed yet — this is the plan task, execution is task 004

## Inventory — 5 independent re-implementations of the same old format, not one shared helper

| # | Location | What it produces | Consumers |
|---|---|---|---|
| 1 | `app/(tabs)/index.tsx:142` (inline, no named export) | `${y}-${m}-${d}` | `TaskMap` keys → AsyncStorage `@tasks` + `tasks.date` (Supabase, via `lib/task-supabase.ts:taskToDbRow`) |
| 2 | `lib/task-schedule.ts:6` `dateKeyFromParts()` (+ `parseDateKey()` at line 10, which inverts it) | `${y}-${m}-${d}` | `buildDateOptions()` — the date-picker wheel used when scheduling a task |
| 3 | `lib/body-data.ts:113` `dateKey()` (exported) | `${y}-${m}-${d}` | `stepsHistory` keys inside the `BodyData` AsyncStorage blob; re-exported and used by `lib/steps-data.ts` |
| 4 | `lib/apple-sync.ts:344` `dateKeyFromDate()` | `${y}-${m}-${d}` | HealthKit/Apple Reminders sync matching against `stepsHistory` and tasks by date |
| 5 | `lib/workout-data.ts:73` (inline, no named export) | `${y}-${m}-${d}` | `workout_done_log.date` and `pb_log.date` (Supabase TEXT columns) |

Two more files touch dates but don't generate persisted keys, so they're **out of scope** for this migration (no change needed):
- `app/calendar/index.tsx` — uses `${year}-${month}` only as an in-memory UI grouping key for month blocks, never persisted.
- `app/calendar/day.tsx` — only compares `Date` objects field-by-field, never serialises a key.

`lib/tasks-core.ts` defines the `Task`/`TaskMap` types but does not itself generate date keys — the generator lives in `index.tsx` (#1 above).

## What persists in Supabase vs. AsyncStorage-only
- **Supabase TEXT columns using the old format:** `tasks.date`, `workout_done_log.date`, `pb_log.date`.
- **AsyncStorage-only (never reaches Supabase in this format):** `@tasks` TaskMap keys, `BodyData.stepsHistory` keys. (`water_logs.logged_at` / `body_weight_logs.logged_at` are `TIMESTAMPTZ`, not date-key strings — unaffected.)

## Migration plan
**Decision: one-time rewrite-in-place, not a flag-day dual-format cutover.** This app has no production users yet (single-developer dogfooding, confirmed by the dev-only Supabase project and the placeholder profile/progress/tree tabs) — there's no live traffic to keep both formats compatible for, so a permanent dual-format parser would be pure complexity with zero payoff. Rewrite the data once, then delete the old format from existence.

1. **Consolidate the 5 implementations into one shared helper, `lib/dateKey.ts`** exporting `toDateKey(d: Date): string` (date-fns `format(d, 'yyyy-MM-dd')`) and `fromDateKey(key: string): Date`. This is a prerequisite of task 004, not optional — otherwise the bug just gets reintroduced piecemeal the next time someone touches one of these five files.
2. **Code changes (task 004):** point all 5 call sites at the new shared helper; delete the old inline/duplicated implementations entirely (`dateKeyFromParts`, `dateKey`, `dateKeyFromDate`, the two inline template literals).
3. **AsyncStorage data migration:** a one-time function (e.g. `lib/migrateDateKeysV2.ts`), run once from `app/_layout.tsx` on boot, guarded by an AsyncStorage flag (`@dateKeyMigrationV2Done`):
   - Load `@tasks`, rewrite every key from `${y}-${m}-${d}` to zero-padded `${y}-${pad(m+1)}-${pad(d)}`, save back.
   - Load the `BodyData` blob, rewrite `stepsHistory` keys the same way, save back.
   - Set the flag so this never runs twice.
4. **Supabase data migration (migration 002, part of task 004):** pure SQL, no app code needed —
   ```sql
   UPDATE tasks SET date =
     split_part(date,'-',1) || '-' ||
     lpad((split_part(date,'-',2)::int + 1)::text, 2, '0') || '-' ||
     lpad(split_part(date,'-',3)::int::text, 2, '0')
   WHERE date ~ '^\d{4}-\d{1,2}-\d{1,2}$';
   -- repeat for workout_done_log.date and pb_log.date
   ```
   Guard with the regex `WHERE` clause so it's safe to re-run and a no-op once already migrated (new-format dates won't match `^\d{4}-\d{1,2}-\d{1,2}$` ambiguously — both old and new format match that regex, so this SQL must run exactly once; task 004 should run it as a numbered migration, not ad hoc, so it's never accidentally re-applied against already-migrated data. Safer alternative: add a one-time marker column or just run it manually once and note the date in current-state.md.)
5. **Order of operations for task 004:** ship the AsyncStorage migration function and the Supabase migration SQL together, deploy, confirm via manual check that a sample task/workout reads correctly, *then* swap the code to write the new format going forward.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
