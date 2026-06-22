# Task 077: Dark theme rollout

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 001

## Goal
Reconcile the OLD light theme (#F5F5F5 bg, #E0E0E0 border) used in already-built screens with the canonical dark system (#0A0A0A bg, #FF4D00 accent, #2A2A2A border, PressStart2P/SpaceMono) from system-model.md. Do NOT half-apply Brand v2 (Michroma/Chakra Petch) — that decision is still pending.

## Key files
every existing screen and component using the old token values

## Acceptance criteria
- [ ] No screen mixes old light tokens with new dark tokens
- [ ] Single source of truth for colours lives in one tokens file, nothing hardcoded inline after this task
- [ ] Brand v2 fonts/colours are not introduced anywhere

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
