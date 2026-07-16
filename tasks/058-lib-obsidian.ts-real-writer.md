# Task 058: lib/obsidian.ts real writer

**Phase:** 7 — Obsidian Sync
**Status:** phase 1 done 2026-07-16 (see below); phase 2 pending
**Depends on:** 014 (phase 1 only — see revision note)

## Revision note (2026-07-16)
This task originally assumed `lib/obsidian.ts` writes to the local filesystem
for the iCloud/Obsidian round-trip, hence depending on task 056 (the iCloud
entitlement). Investigation this session found: (a) `tools/vault-agent`, the
only thing that ever populated `vault_files`, is a single-hardcoded-account
dev tool that can't serve real users; (b) the full iCloud+Obsidian round-trip
needs an Apple entitlement + EAS device build, both slow/blocked elsewhere in
this project; (c) it also assumes users have Obsidian Sync (a paid product),
which the user explicitly wants to avoid requiring.

Split into two phases (full design: `/Users/nova/.claude/plans/how-am-i-going-memoized-ember.md`):
- **Phase 1 (done)**: `lib/obsidian.ts` writes directly to `vault_files` via
  Supabase — no filesystem, no entitlement, works for every user immediately.
  This is what's described below, revised.
- **Phase 2 (pending, new/renamed task)**: one-click "Export to Obsidian" —
  a `.zip` of `vault_files`'s `.md` content via `jszip` + `expo-sharing`,
  shared through the OS share sheet. No Obsidian Sync subscription, no iCloud
  entitlement. Task 059/056's original filesystem-sync scope is deferred
  further, as an optional live-sync layer on top of this, not required to
  ship a working second brain.

## Goal (phase 1, as actually built)
Flip postWrite step 5 from a no-op to a real markdown-formatted writer,
matching the spec's file structure (Daily Notes/, Library/, Workouts/,
Habits/, Goals/) but targeting `vault_files` rows, not real files.

## Key files
lib/obsidian.ts (I/O wrapper), lib/obsidianNotes.ts (pure note-building logic
+ vitest coverage — split out so it's testable without pulling in
react-native transitively)

## Acceptance criteria
- [x] Front-matter format matches the spec's convention (date/tags/source) — regenerated on every write
- [x] Deleting an item removes it (meals: just that line from the Daily Note, via the existing `deleted_at` soft-delete) — narrowed from the original "moves to Recycle-Bin/" criterion, which assumes a real filesystem move that doesn't exist in phase 1; revisit if/when phase 2 or a real Recycle-Bin move is built
- [ ] Real Recycle-Bin/ file moves — deferred to phase 2 (needs an actual filesystem)

## Read first
system-model.md, database.md, current-state.md — in that order. Update current-state.md when this task is verified done, then commit and push.
