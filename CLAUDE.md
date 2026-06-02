# CLAUDE.md

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

**Date keys** — dates are keyed as `"YYYY-M-D"` (e.g. `"2026-5-1"` for June 1 2026; month is 0-indexed). This format is used in both AsyncStorage and the Supabase `date` column.

**Fonts** — `PressStart2P_400Regular` (pixel/display) and `SpaceMono_400Regular`/`SpaceMono_700Bold` loaded via `expo-font` in the root layout. Both must be loaded before the splash screen hides. Use `PressStart2P` for headings/titles and `SpaceMono` for body/labels.

**Design tokens** — accent `#FF4D00`, background `#F5F5F5`, border `#E0E0E0`, muted text `#999`.

**Path alias** — `@/` resolves to the repo root (configured in `tsconfig.json`).

**Screens** — only `app/(tabs)/index.tsx` (TODAY) is fully built. `gym`, `tree`, `progress`, and `profile` are placeholder screens.
