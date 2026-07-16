// ─────────────────────────────────────────────────────────────────────────
// lib/obsidian.ts — server-native vault note writer (Code Audit v2 fix plan
// P5, phase 1)
//
// Writes AI-readable notes directly to `vault_files` via Supabase. Does NOT
// touch iCloud or a real Obsidian vault — see tools/vault-agent (a dev-only
// single-account Mac tool, never launched for real users) and the planned
// "Export to Obsidian" .zip feature for the actual filesystem/Obsidian
// round-trip. Path conventions here (Daily Notes/, Habits/, etc.) match the
// spec's file structure so that later work stays forward-compatible — this
// is just not that work yet.
//
// Scope is deliberately lean: only entities with real narrative value get a
// note (task/meal → the day's Daily Note, workout/goal/book/movie → their
// own file, habit → a rolling per-habit log). sleep/mood/water/weight/
// medication/focus/activity/expense are thin deltas already fully captured
// in structured tables + cumulative_stats — a note adds nothing buildContext
// (supabase/functions/_shared/buildContext.ts) can't already give the AI.
//
// The actual note-building logic is pure and lives in ./obsidianNotes.ts —
// split out so it stays testable from vitest without pulling in react-native
// transitively (this file's `./supabase` import does, via Flow syntax
// vitest/rolldown can't parse).
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import type { Entity, Action } from './postWrite';
import { buildNote, frontMatter, upsertMarkedLine, removeMarkedLine } from './obsidianNotes';

export { buildNote, frontMatter, upsertMarkedLine, removeMarkedLine };
export type { VaultNote } from './obsidianNotes';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function stripFrontMatter(content: string | null | undefined): string {
  return (content ?? '').replace(/^---[\s\S]*?---\s*/, '').trim();
}

async function upsertVaultFile(userId: string, path: string, entity: Entity, body: string, existingId?: string): Promise<void> {
  const content = `${frontMatter({ tags: ['habit-tracker', entity], source: 'app' })}\n\n${body}`;
  await supabase.from('vault_files').upsert(
    {
      id: existingId ?? genId(),
      user_id: userId,
      path,
      content,
      source: 'app',
      deleted_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,path' },
  );
}

export async function writeObsidian(entity: Entity, record: any, action: Action): Promise<void> {
  const note = buildNote(entity, record, action);
  if (!note) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    if (note.kind === 'replace') {
      await upsertVaultFile(userId, note.path, entity, note.body);
      return;
    }

    const { data: existing } = await supabase
      .from('vault_files')
      .select('id, content')
      .eq('user_id', userId)
      .eq('path', note.path)
      .maybeSingle();
    const existingBody = stripFrontMatter(existing?.content);

    const nextBody = note.kind === 'removeLine'
      ? removeMarkedLine(existingBody, note.markerId)
      : upsertMarkedLine(existingBody, note.markerId, note.line, note.header);

    if (!nextBody.trim()) {
      // Nothing left (e.g. the last meal of the day was deleted) — soft-
      // delete rather than leave an empty husk row.
      if (existing) await supabase.from('vault_files').update({ deleted_at: new Date().toISOString() }).eq('id', existing.id);
      return;
    }

    await upsertVaultFile(userId, note.path, entity, nextBody, existing?.id);
  } catch (err) {
    // Never block the caller's primary write — postWrite.ts's
    // Promise.allSettled already isolates this, but a defensive catch keeps
    // a Supabase hiccup from ever surfacing as an unhandled rejection.
    console.warn('writeObsidian error:', err);
  }
}
