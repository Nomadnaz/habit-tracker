# Task 020: Settings: API key + companion setup (minimal)

**Phase:** 1 — Companion Infra
**Status:** implemented (2026-07-05) — pending live migration/deploy + on-device verify
**Depends on:** 006

## Goal
Minimal Settings screen additions: API-key toggle (own key vs app credits), and a per-companion setup screen (name + photo) writing to companion_personas. Full Privacy Centre is task 070.

## Key files
app/settings/index.tsx (NOT `app/(tabs)/settings.tsx` — see notes), app/settings/companion-persona.tsx, supabase/functions/save-api-key/ (new), migration 014_user_api_keys.sql (new)

## Acceptance criteria
- [x] User can set a name+photo per companion — `companion-persona.tsx`, photo via `expo-image-picker` (camera/library), upserts `companion_personas`.
- [x] API key, if provided, stored encrypted server-side, never in the app bundle — `save-api-key` Edge Function encrypts with AES-256-GCM (`API_KEY_ENCRYPTION_SECRET`, a server-only Supabase secret) before writing to the new `user_api_keys` table; plaintext exists only for the duration of the request, never logged, never returned to the client.

## Notes (2026-07-05)
- **Not a tab.** The task file's suggested `app/(tabs)/settings.tsx` predates system-model.md's nav decision ("5 tabs: Today/Habits/Health/Fitness/Life-hub. Profile via header icon") — adding an 8th tab (after this session already added Habits and Activity) would have made an already-crowded tab bar worse for no benefit. Built as `app/settings/index.tsx`, a modal route reachable via a new gear icon in the Today header, consistent with how calorie/ble-bridge are already reached.
- **BYOK is stored, not yet consumed.** This task's own title says "minimal" — the toggle encrypts and saves a key, but `ai-chat`'s actual Anthropic call still always uses the app's own `ANTHROPIC_API_KEY` secret. Wiring "if this user has a saved key, decrypt and use it instead" into `ai-chat`'s request path is real follow-up work, not done here — flagging rather than implying it's end-to-end.
- Photo is a local file URI (same pattern as `lib/meals-data.ts`'s meal photos) — a real Supabase Storage upload is future hardening, not in this task's scope.
- tsc: client files clean; `save-api-key/index.ts` has the same Deno-vs-Node false-positive pattern as `ai-chat`/`food-vision`/`daily-briefing` (not real errors — these functions aren't bundled by the app).
- Not deployed (`supabase functions deploy save-api-key`, needs `API_KEY_ENCRYPTION_SECRET` set via `supabase secrets set` — generate with e.g. `openssl rand -base64 32`) or verified on-device.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
