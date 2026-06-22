# Task 020: Settings: API key + companion setup (minimal)

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006

## Goal
Minimal Settings screen additions: API-key toggle (own key vs app credits), and a per-companion setup screen (name + photo) writing to companion_personas. Full Privacy Centre is task 070.

## Key files
app/(tabs)/settings.tsx, app/settings/companion-persona.tsx

## Acceptance criteria
- [ ] User can set a name+photo per companion
- [ ] API key, if provided, stored encrypted server-side, never in the app bundle

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
