# Task 007: lib/companions.ts config

**Phase:** 1 — Companion Infra
**Status:** pending
**Depends on:** 006

## Goal
Generic, scalable config object for the 14 companion types (life, gym, calorie, activity, habitCoach, sleep, library, cycle, medication, finance, mood, travel, focus, goals): defaultName, contextSources[], systemPromptTemplate, actions[].

## Key files
lib/companions.ts

## Acceptance criteria
- [ ] All 14 companions present as config entries
- [ ] Adding a 15th companion requires zero code changes elsewhere — only a new entry
- [ ] Typed with a CompanionConfig interface

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
