# Task 030: Photo meal logging

**Phase:** 2 — Screens
**Status:** DONE — vision routed through a dedicated `food-vision` function (not `ai-chat`) to avoid colliding with the other session; mock fallback until deployed
**Depends on:** 013,029

## Goal
Camera icon -> expo-camera/expo-image-picker -> compress <1MB via expo-image-manipulator -> ai-chat vision call (claude-haiku-4-5) -> pre-filled form -> user confirms or edits -> save.

## Key files
app/(tabs)/calorie.tsx (extended)

## Acceptance criteria
- [x] UI explicitly labels AI estimates as editable ("AI ESTIMATE — TAP ANY NUMBER TO ADJUST", + "(demo — vision not connected yet)" when the function isn't deployed)
- [x] User must confirm before the meal is saved — never auto-saved (estimate only pre-fills the editor; save requires tapping "LOG IT")
- [x] Manual path (task 029) still works if photo logging fails (image-manipulation failure drops into the manual editor with the photo attached; `foodVision` never throws — returns a mock on backend failure)

**Deviation:** the spec routes the vision call through `ai-chat`, but that function is being edited by a separate session, so the call goes through a dedicated `supabase/functions/food-vision/` instead (single seam in `lib/foodVision.ts`; converging onto ai-chat later is a one-line change). User must `supabase functions deploy food-vision` + set `ANTHROPIC_API_KEY` for real estimates.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
