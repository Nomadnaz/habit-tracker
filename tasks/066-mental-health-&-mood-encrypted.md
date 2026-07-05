# Task 066: Mental health & mood (encrypted)

**Phase:** 8 — Polish
**Status:** partially implemented (2026-07-05) — mood log done, journal/therapy deliberately NOT built
**Depends on:** 013

## Goal
Lightweight mood log (1-10 + stress) is the MVP-value part — build that fully. Journal and therapy notes require real client-side encryption (expo-secure-store key, ciphertext only in Supabase) before a single field ships.

## Key files
app/modals/mood.tsx, lib/mood-data.ts (new); lib/encryption.ts NOT created — see notes; supabase/migrations/019_mental_health.sql (`018` was taken by Finance this session)

## Acceptance criteria
- [ ] journal_entries.content and therapy_notes.content are ciphertext in the database — **N/A, nothing writes to these tables at all.** No crypto dependency is installed in this project (no `expo-secure-store`, no AES library, no Web-Crypto-equivalent available in the React Native/Hermes runtime) and there is no device this session to verify one works correctly. The task's own words are "before a single field ships" — the honest reading of that gate, with no way to verify an encryption implementation, is to ship zero journal/therapy fields rather than guess at working crypto for a mental-health journal. Tables exist (schema-only) so a future session doesn't need another migration.
- [x] No Edge Function holds the decryption key — moot given the above (no encryption exists yet to hold a key for), but also true: nothing in `supabase/functions/` references these tables at all.
- [x] Mood AI never receives journal/therapy content unless the user explicitly asks — trivially satisfied: the new `mood` companion's `contextSources` is `['mood_logs', 'user_context_summary']` only; `buildContext`'s `want('mood_logs')` block never queries `journal_entries`/`therapy_notes`.

## Notes (2026-07-05)
Mood log ships fully and is plaintext by design — system-model.md's client-side-encryption privacy rule names journal/therapy specifically, not mood. 1-10 mood + stress scales, trigger tags, optional note, a 14-day sparkline. `app/modals/mood.tsx` reachable via a new emoticon icon on the Today header (now 8 icons — see tasks/065's crowding note, still not fixed). If a future session adds real encryption, the natural next step is `expo-secure-store` (device-keychain-backed key storage, well-supported in Expo) + `expo-crypto`'s random bytes, but AES-GCM itself would still need a vetted library or Web-Crypto polyfill — worth research-first, not a same-session add.

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
