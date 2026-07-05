# Task 031: Migration: activity domain (no trail DB yet)

**Phase:** 2 — Screens
**Status:** written (2026-07-05) — pending live run
**Depends on:** 002

## Goal
Add activities, activity_stats_cumulative tables only. trail_database/trail_ratings/trail_collections are explicitly held back (community feature, task 067-adjacent territory, not in this task).

## Key files
supabase/migrations/012_activity.sql (`008` was already taken — see "Migration numbers are hints" in CLAUDE.md)

## Acceptance criteria
- [x] Migration written, additive/idempotent, safe to re-run
- [x] No PostGIS extension needed yet — `route_geojson` is plain `jsonb`, not a `geography` column
- [ ] Run clean against the live Supabase project — **not yet run**, needs a human to paste it into the SQL editor

## Notes (2026-07-05)
`activity_stats_cumulative` omits `trails_completed`/`trails_submitted`/`photos_taken` from database.md's full definition — those are trail-database/community fields this task explicitly holds back; nothing populates them yet.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
