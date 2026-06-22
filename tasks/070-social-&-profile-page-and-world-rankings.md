# Task 070: Social & profile page + world rankings

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 014,063

## Goal
FUTURE. app/(tabs)/social.tsx, app/(tabs)/profile.tsx. Build cumulative-stats plumbing (already riding on postWrite) but keep the social surface dark until there's a user base. rankings-calculate pg_cron job.

## Key files
app/(tabs)/social.tsx, app/(tabs)/profile.tsx, supabase/functions/rankings-calculate/index.ts

## Acceptance criteria
- [ ] cumulative_stats populated correctly even while the social UI stays behind a feature flag
- [ ] World rankings only include users with ranking_opted_in = true

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
