// ─────────────────────────────────────────────────────────────────────────
// lib/obsidianNotes.ts — pure note-building logic for lib/obsidian.ts
// ─────────────────────────────────────────────────────────────────────────
// Split out of lib/obsidian.ts so this stays importable from vitest without
// pulling in react-native transitively (lib/obsidian.ts imports ./supabase,
// whose dependency chain includes Flow syntax vitest/rolldown can't parse —
// same reason lib/bodyFormulas.ts etc. never import supabase directly).
// ─────────────────────────────────────────────────────────────────────────

import type { Entity, Action } from './postWrite';

function esc(s: string): string {
  return /[:"'#]|^\s|\s$/.test(s) ? JSON.stringify(s) : s;
}

/** YAML front-matter block, matching tools/vault-agent's existing convention. */
export function frontMatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (Array.isArray(v)) return `${k}: [${v.map(x => esc(String(x))).join(', ')}]`;
      if (typeof v === 'string') return `${k}: ${esc(v)}`;
      return `${k}: ${v}`;
    });
  return `---\n${lines.join('\n')}\n---`;
}

function dailyNotePath(date: string): string {
  return `Daily Notes/${date}.md`;
}

/** One entity write, resolved to what needs to happen to a vault_files row. */
export type VaultNote =
  | { kind: 'append'; path: string; markerId: string; line: string; header?: string }
  | { kind: 'replace'; path: string; body: string }
  | { kind: 'removeLine'; path: string; markerId: string };

/**
 * Pure — decides WHAT to write for a postWrite() call, or null if this
 * entity/action is out of phase-1 scope (or the record is missing a field a
 * note needs, e.g. the mislabeled `postWrite('workout', pbLogRow, ...)` call
 * in lib/actionExecutor.ts's log_pb case, which has no template_id).
 */
export function buildNote(entity: Entity, record: any, action: Action): VaultNote | null {
  if (action === 'delete') {
    // Only meal deletes flow through today. Removes just that line from the
    // day's Daily Note — never soft-deletes the whole file (other entries
    // that day must survive).
    if (entity === 'meal' && record?.date && record?.id) {
      return { kind: 'removeLine', path: dailyNotePath(record.date), markerId: record.id };
    }
    return null;
  }

  switch (entity) {
    case 'task': {
      if (!record?.date || !record?.id || !record?.label) return null;
      const time = record.hour != null
        ? ` @ ${String(record.hour).padStart(2, '0')}:${String(record.minute ?? 0).padStart(2, '0')}`
        : '';
      return {
        kind: 'append', path: dailyNotePath(record.date), markerId: record.id,
        line: `- [${record.done ? 'x' : ' '}]${time} ${record.label}`,
      };
    }
    case 'meal': {
      if (!record?.date || !record?.id || !record?.name) return null;
      return {
        kind: 'append', path: dailyNotePath(record.date), markerId: record.id,
        line: `- ${record.mealType ?? 'meal'}: ${record.name} (${record.calories ?? 0} cal)`,
      };
    }
    case 'habit': {
      if (!record?.habit_id || !record?.date) return null;
      return {
        kind: 'append', path: `Habits/${record.habit_id}.md`, markerId: record.date,
        line: `- ${record.date}: ${record.completed ? 'done' : 'not done'} (streak ${record.streak ?? 0})`,
        header: record.name ? `# ${record.name}` : undefined,
      };
    }
    case 'workout': {
      // The 'workout' entity is also (mis-)used for PB-log rows
      // (lib/actionExecutor.ts's log_pb case: {exercise_id, weight_kg, ...},
      // no template_id) — returning null here safely skips those.
      if (!record?.template_id || !record?.date) return null;
      const title = record.template_name ?? 'Workout';
      return {
        kind: 'replace', path: `Workouts/${record.date}-${record.template_id}.md`,
        body: `# ${title}\n\nCompleted ${record.date}.`,
      };
    }
    case 'goal': {
      if (!record?.goal_id || !record?.milestone_id) return null;
      const title = record.title ?? 'Goal';
      return {
        kind: 'replace', path: `Goals/${record.goal_id}.md`,
        body: `# ${title}\n\nMilestone ${record.milestone_id}: ${record.completed ? 'completed' : 'reopened'}.`,
      };
    }
    case 'book': {
      if (!record?.id || !record?.status) return null;
      const title = record.title ?? 'Book';
      return { kind: 'replace', path: `Library/Books/${record.id}.md`, body: `# ${title}\n\nStatus: ${record.status}.` };
    }
    case 'movie': {
      if (!record?.id || !record?.status) return null;
      const title = record.title ?? 'Movie';
      const rating = record.rating != null ? ` Rating: ${record.rating}/5.` : '';
      return { kind: 'replace', path: `Library/Movies/${record.id}.md`, body: `# ${title}\n\nStatus: ${record.status}.${rating}` };
    }
    default:
      // sleep/mood/water/weight/medication/focus/activity/expense —
      // deliberately out of phase-1 scope, see lib/obsidian.ts's header.
      return null;
  }
}

const marker = (id: string) => `<!--id:${id}-->`;

/**
 * Merge one line into a multi-line note body, replacing the existing line
 * with the same markerId (idempotent re-writes — e.g. completing a task
 * twice, or toggling a habit on the same day) or appending a new one.
 * `header` (e.g. a habit's `# Name` heading) is seeded once, only if the
 * body is currently empty — it's never touched again since it carries no
 * marker and update passes only ever match/replace marked lines.
 */
export function upsertMarkedLine(existingBody: string, markerId: string, line: string, header?: string): string {
  const seeded = !existingBody.trim() && header ? `${header}\n\n` : existingBody;
  const fullLine = `${line} ${marker(markerId)}`;
  const lines = seeded.split('\n').filter(l => l.trim());
  const idx = lines.findIndex(l => l.includes(marker(markerId)));
  if (idx >= 0) lines[idx] = fullLine; else lines.push(fullLine);
  return lines.join('\n');
}

/** Remove one marked line (e.g. a deleted meal) from a note body. */
export function removeMarkedLine(existingBody: string, markerId: string): string {
  return existingBody
    .split('\n')
    .filter(l => l.trim() && !l.includes(marker(markerId)))
    .join('\n');
}
