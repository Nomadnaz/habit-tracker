# Task 064: Library page

**Phase:** 8 — Polish
**Status:** partially implemented (2026-07-05) — manual entry only, no external API integration
**Depends on:** 013

## Goal
FUTURE. app/(tabs)/library.tsx — Books/Movies/Links/Ideas tabs, Google Books + TMDB integration, natural-language capture via Library AI.

## Key files
app/modals/library.tsx (NOT a tab — see notes), lib/library-data.ts (new), supabase/migrations/021_library.sql

## Acceptance criteria
- [ ] TMDB attribution notice visible in the movies section — **not added.** No TMDB API key/integration exists this session (system-model.md lists it as a "slow external clock" to start, not something buildable without credentials); showing a TMDB attribution notice while displaying zero TMDB data would misrepresent what the screen does. Instead shows an honest "manual entry only, TMDB not wired up yet" note.
- [ ] Natural-language capture classifies type correctly before saving — **partially.** `classifyCapture()` in `lib/library-data.ts` is a plain heuristic (URL regex, then keyword matching, then a length-based book/idea default) — genuinely useful for routing a paste into the right list, but this is NOT the "Library AI" the task describes (real classification would need Google Books/TMDB metadata lookups to disambiguate a title confidently, which needs the same missing API keys).

## Notes (2026-07-05)
- Not a tab — same reasoning as Finance/Settings/Sleep/Goals this session: the tab bar is already crowded (7 tabs) and system-model.md's nav decision doesn't call for a Library tab. Built as a modal with a Books/Movies/Links/Ideas segmented toggle, reachable via a new book icon on the Today header (now 9 icons on that header — flagged repeatedly this session, still not fixed; a real redesign, e.g. an overflow sheet, is overdue).
- `reading_stats`/`movie_stats` (aggregate rollup tables from database.md) intentionally not created — nothing reads them yet, and they're trivially derivable client-side from `books`/`movies` if something eventually needs them.
- tsc clean. Not run live or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
