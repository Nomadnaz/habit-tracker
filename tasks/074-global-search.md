# Task 074: Global search

**Phase:** 8 — Polish
**Status:** implemented (2026-07-05) — pending on-device verify
**Depends on:** none

## Goal
FUTURE. components/GlobalSearch.tsx — searches pages, habits, books, movies, workouts, tasks/appointments, goals, links/ideas, finance, trails. Never searches journal/therapy/mood content/raw email.

## Key files
components/GlobalSearch.tsx, app/modals/search.tsx (new)

## Acceptance criteria
- [x] Encrypted fields (journal, therapy) are structurally unsearchable, not just excluded by convention — trivially true: `GlobalSearch` never reads `journal_entries`/`therapy_notes` at all, and those tables hold zero plaintext content anywhere in this app (task 066 shipped them schema-only). Mood content and raw email are excluded the same way — never read, not filtered post-hoc.
- [x]/[ ] Result taps navigate to the specific record — **partial, documented per type.** Goals: yes, via a `highlightId` param that `app/modals/goals.tsx` now reads to auto-expand the matched goal. Tasks: yes, via `calendar/day`'s existing `date` param. Habits/library (books/movies/links/ideas)/finance (expenses/bills)/workouts: navigates to the section screen only — none of those screens have per-item deep-link support yet, and adding it to all of them was out of scope for one pass. Flagged here rather than claimed complete.

## Notes (2026-07-05)
- Indexes local AsyncStorage stores directly (`@habits`, `@goals`, `@library_books`/`_movies`/`_links`/`_ideas`, `@expenses`/`@bills`, `@wk_templates`, `@tasks`) rather than querying Supabase — consistent with this app's local-first pattern, and search should work offline.
- "Trails" (trail_database) is not searched — that table doesn't exist yet (FUTURE, task 067-adjacent per tasks/031's notes).
- Reachable via a new magnifying-glass icon, placed in the title row next to "TODAY" (not grouped with the other action icons, which are already flagged as overcrowded — see tasks/064's notes).
- tsc clean. Not verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
