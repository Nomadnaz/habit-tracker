# Task 030: Photo meal logging

**Phase:** 2 — Screens
**Status:** pending
**Depends on:** 013,029

## Goal
Camera icon -> expo-camera/expo-image-picker -> compress <1MB via expo-image-manipulator -> ai-chat vision call (claude-haiku-4-5) -> pre-filled form -> user confirms or edits -> save.

## Key files
app/(tabs)/calorie.tsx (extended)

## Acceptance criteria
- [ ] UI explicitly labels AI estimates as editable, not verified, figures
- [ ] User must confirm before the meal is saved — never auto-saved from vision output
- [ ] Manual path (task 029) still works if photo logging fails

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
