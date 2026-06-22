# CLAUDE.md
Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read these three files first, every session, in this order
1. `system-model.md` — canonical architecture and conflict-resolution rules. Wins over everything else, including this file.
2. `database.md` — full schema reference, including what's already live vs. what's proposed.
3. `current-state.md` — what's actually built right now, known conflicts, the next task to pick up.

Then read **one task file** from `tasks/` (numbered, e.g. `tasks/002-...md`) — the next pending one per `current-state.md`. Do not load the full master spec (`habit-tracker-master-spec.md`, kept outside this repo) into context; it's the human-readable reference the task files were distilled from, and it's too large to feed an agent directly.

## The build loop
1. Read the three docs above + the next task file.
2. Enrich the task (fill in implementation detail it intentionally left light).
3. Implement it — one file/feature at a time, nothing beyond the task's stated scope.
4. Deploy/run it and verify against the task's acceptance criteria.
5. Update `current-state.md` (tick criteria, add a progress-log line).
6. Commit the specific files changed and push.
7. Move to the next task.

One task per session. If a task is blocked (its file says so — e.g. waiting on an Apple/Google approval), say so and stop rather than working ahead out of order; dependencies between tasks are real.

## Expo version

This project uses **Expo SDK ~54.0.0**. Always reference the versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo-specific code — APIs change between SDK versions.

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go)
npx expo start --web    # run in browser
npx expo start --android
npx expo start --ios
npm test                 # vitest — added in tasks/021, covers lib/streaks.ts and lib/classifier.ts
```

No build step or linter configured yet.

## Architecture

See `system-model.md` for the full picture (data layer / intelligence layer / surface layer, the four data flows, the post-write fan-out). Summary of what's true in code today:

**Routing** — Expo Router (file-based). `app/_layout.tsx` is the root; it guards all routes by checking Supabase session state and redirecting to `/(auth)/login` or `/(tabs)` accordingly. Font loading and splash screen are also gated here.

**Auth** — Supabase (`lib/supabase.ts`). Session is persisted via AsyncStorage. The root layout subscribes to `onAuthStateChange` and redirects reactively.

**Data — local-first with Supabase backup.** Tasks are stored in AsyncStorage under `@tasks`, mutations update AsyncStorage synchronously then fire-and-forget to Supabase. This pattern is canonical (see system-model.md flow 1) and should be followed for every new domain table, but every new write must go through `lib/postWrite.ts` (landing in `tasks/014`) once it exists — never touch `cumulative_stats`, badges, friend-feed, or Obsidian directly from a screen.

**Date keys** — ⚠️ currently `"YYYY-M-D"` (0-indexed month) in the existing code. This is **superseded** — canonical is zero-padded ISO `YYYY-MM-DD`, 1-indexed, local timezone (see `system-model.md`). Migration tracked in `tasks/003`–`004`; don't introduce new code in the old format.

**Design tokens** — ⚠️ currently light theme (`#FF4D00` accent, `#F5F5F5` bg, `#E0E0E0` border) in the existing code. Canonical is the dark system (`#0A0A0A` bg, `#FF4D00` accent, `#2A2A2A` border, PressStart2P/SpaceMono). Migration tracked in `tasks/077`, deliberately last — don't half-apply it earlier. Brand v2 (Michroma/Chakra Petch, cyan/amber) is **not** an active decision; ignore it.

**Fonts** — `PressStart2P_400Regular` (pixel/display) and `SpaceMono_400Regular`/`SpaceMono_700Bold` loaded via `expo-font` in the root layout, both before the splash screen hides.

**Path alias** — `@/` resolves to the repo root (configured in `tsconfig.json`).

**Screens** — see `current-state.md` for the up-to-date per-screen build status; it's more accurate than any static description here.

## Migration numbers in task files are hints, not guarantees
Task files were generated in dependency order before any of them ran, so each one's suggested `supabase/migrations/0NN_*.sql` filename assumes the numbers before it landed exactly as planned. They don't always — `tasks/005` claimed `003` for a reconciliation task that wasn't in the original numbering, bumping everything after it. Before naming a new migration file, always run `ls supabase/migrations/` and use the next number actually on disk, not the number written in the task file.

## Rules specific to this project
- Never feed the full master spec into context — the three docs above plus one task file is the intended working set.
- One feature/task per session.
- If something breaks, paste the error directly rather than guessing.
- Commit after every working task: `git add [specific files] && git commit -m "feat: ..." && git push`.
- Never refactor or "improve" code outside a task's stated scope.
