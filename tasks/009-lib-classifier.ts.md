# Task 009: lib/classifier.ts

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** none

## Goal
Haiku-vs-Sonnet complexity classifier: regex pass first (free), word-count heuristic fallback. Pure function, no network call.

## Key files
lib/classifier.ts

## Acceptance criteria
- [ ] classify(message) returns 'simple' | 'complex' deterministically
- [ ] No network calls inside the classifier
- [ ] Has unit tests (see task 020)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
