# Task 072: Full Privacy Centre

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 020,066

## Goal
Expand the minimal Settings (task 020) into the full Privacy Centre: per-data-type AI access toggles, data export (JSON/Obsidian zip), data deletion (30-day grace), GDPR consent log.

## Key files
app/(tabs)/settings.tsx (expanded)

## Acceptance criteria
- [ ] Therapy notes toggle is permanently off with no way to enable it
- [ ] Data export job completes within 24h and emails the user
- [ ] Account deletion has a working 30-day grace + reactivation path

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
