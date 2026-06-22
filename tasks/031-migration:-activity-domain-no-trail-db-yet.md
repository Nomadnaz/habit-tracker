# Task 031: Migration: activity domain (no trail DB yet)

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 002

## Goal
Add activities, activity_stats_cumulative tables only. trail_database/trail_ratings/trail_collections are explicitly held back (community feature, task 067-adjacent territory, not in this task).

## Key files
supabase/migrations/008_activity.sql

## Acceptance criteria
- [ ] Migration runs clean
- [ ] No PostGIS extension needed yet — that arrives only with the trail database

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
