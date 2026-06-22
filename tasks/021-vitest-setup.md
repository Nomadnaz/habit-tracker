# Task 021: vitest setup

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 009,015

## Goal
Add vitest as the project's test runner (none configured currently). Wire it to run lib/streaks.ts and lib/classifier.ts tests.

## Key files
package.json, vitest.config.ts, lib/__tests__/classifier.test.ts

## Acceptance criteria
- [ ] npm test runs vitest
- [ ] Both pure modules have passing test suites
- [ ] CLAUDE.md commands section updated to mention npm test

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
