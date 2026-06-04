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

## Expo version

This project uses **Expo SDK ~54.0.0**. Always reference the versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any Expo-specific code — APIs change between SDK versions.

## Commands

```bash
npx expo start          # start dev server (scan QR with Expo Go)
npx expo start --web    # run in browser
npx expo start --android
npx expo start --ios
```

No build step, no test runner, no linter configured.

## Architecture

**Routing** — Expo Router (file-based). `app/_layout.tsx` is the root; it guards all routes by checking Supabase session state and redirecting to `/(auth)/login` or `/(tabs)` accordingly. Font loading and splash screen are also gated here.

**Auth** — Supabase (`lib/supabase.ts`). Session is persisted via AsyncStorage. The root layout subscribes to `onAuthStateChange` and redirects reactively.

**Data — local-first with Supabase backup**
- Tasks are stored in AsyncStorage under the key `@tasks` as a serialised `TaskMap` (`Record<dateKey, Task[]>`).
- On mount, tasks load from AsyncStorage instantly (no network).
- Mutations (add/toggle/remove) update AsyncStorage synchronously, then fire-and-forget to Supabase in the background.
- Supabase `tasks` table schema: `id uuid, user_id uuid, date text, label text, done boolean, created_at timestamptz`. Row-level security enforces per-user access.
- Today's focus name (and block length index) persist under AsyncStorage `@focus` and Supabase `user_focus` (`user_id`, `name`, `block_idx`). Run `supabase/user_focus.sql` in the Supabase SQL editor once to create the table.

**Date keys** — dates are keyed as `"YYYY-M-D"` (e.g. `"2026-5-1"` for June 1 2026; month is 0-indexed). This format is used in both AsyncStorage and the Supabase `date` column.

**Fonts** — `PressStart2P_400Regular` (pixel/display) and `SpaceMono_400Regular`/`SpaceMono_700Bold` loaded via `expo-font` in the root layout. Both must be loaded before the splash screen hides. Use `PressStart2P` for headings/titles and `SpaceMono` for body/labels.

**Design tokens** — accent `#FF4D00`, background `#F5F5F5`, border `#E0E0E0`, muted text `#999`.

**Path alias** — `@/` resolves to the repo root (configured in `tsconfig.json`).

**Screens** — only `app/(tabs)/index.tsx` (TODAY) is fully built. `gym`, `tree`, `progress`, and `profile` are placeholder screens.
