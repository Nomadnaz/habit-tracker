# Task 066: Mental health & mood (encrypted)

**Phase:** 8 — Polish
**Status:** pending
**Depends on:** 013

## Goal
Lightweight mood log (1-10 + stress) is the MVP-value part — build that fully. Journal and therapy notes require real client-side encryption (expo-secure-store key, ciphertext only in Supabase) before a single field ships.

## Key files
app/modals/mood.tsx, lib/encryption.ts, supabase/migrations/018_mental_health.sql

## Acceptance criteria
- [ ] journal_entries.content and therapy_notes.content are ciphertext in the database, verified by reading the raw row directly
- [ ] No Edge Function holds the decryption key
- [ ] Mood AI never receives journal/therapy content unless the user explicitly asks in that conversation

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
