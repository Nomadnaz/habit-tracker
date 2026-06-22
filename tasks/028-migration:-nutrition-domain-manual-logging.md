# Task 028: Migration: nutrition domain (manual logging)

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 002

## Goal
Add meals, nutrition_targets tables. Skip meal_plans/recipes/grocery_lists/fridge_contents for now — those are the FUTURE meal-planning sub-feature (task 062 territory).

## Key files
supabase/migrations/007_nutrition.sql

## Acceptance criteria
- [ ] Migration runs clean
- [ ] nutrition_targets seeded with onboarding defaults once onboarding exists (task 060) — until then, sensible app defaults

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
