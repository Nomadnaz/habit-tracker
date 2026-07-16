import { describe, it, expect } from 'vitest';
import { buildNote, frontMatter, upsertMarkedLine, removeMarkedLine } from './obsidianNotes';

describe('frontMatter', () => {
  it('renders simple scalar fields', () => {
    expect(frontMatter({ date: '2026-07-16', source: 'app' })).toBe('---\ndate: 2026-07-16\nsource: app\n---');
  });

  it('quotes strings with YAML-special characters', () => {
    expect(frontMatter({ title: 'Call: mum' })).toContain('title: "Call: mum"');
  });

  it('renders arrays inline', () => {
    expect(frontMatter({ tags: ['habit-tracker', 'task'] })).toBe('---\ntags: [habit-tracker, task]\n---');
  });

  it('drops undefined/null fields', () => {
    expect(frontMatter({ a: 'x', b: undefined, c: null })).toBe('---\na: x\n---');
  });
});

describe('buildNote — out-of-scope entities return null', () => {
  for (const entity of ['sleep', 'mood', 'water', 'weight', 'medication', 'focus', 'activity', 'expense'] as const) {
    it(`returns null for '${entity}'`, () => {
      expect(buildNote(entity, { id: '1' }, 'create')).toBeNull();
    });
  }

  it('returns null for a workout record with no template_id (the mislabeled PB-log case)', () => {
    expect(buildNote('workout', { exercise_id: 'bench', weight_kg: 100, date: '2026-07-16' }, 'create')).toBeNull();
  });

  it('returns null for records missing required fields', () => {
    expect(buildNote('task', { date: '2026-07-16' }, 'create')).toBeNull(); // no id/label
    expect(buildNote('habit', { date: '2026-07-16' }, 'create')).toBeNull(); // no habit_id
    expect(buildNote('goal', { goal_id: 'g1' }, 'update')).toBeNull(); // no milestone_id
    expect(buildNote('book', { id: 'b1' }, 'update')).toBeNull(); // no status
  });
});

describe('buildNote — in-scope entities', () => {
  it('builds an append note for a task, with time when present', () => {
    const note = buildNote('task', { id: 't1', date: '2026-07-16', label: 'CALL MUM', hour: 18, minute: 30, done: false }, 'create');
    expect(note).toEqual({
      kind: 'append', path: 'Daily Notes/2026-07-16.md', markerId: 't1',
      line: '- [ ] @ 18:30 CALL MUM',
    });
  });

  it('builds an append note for a task with no time', () => {
    const note = buildNote('task', { id: 't1', date: '2026-07-16', label: 'CALL MUM', done: true }, 'update');
    expect(note).toEqual({ kind: 'append', path: 'Daily Notes/2026-07-16.md', markerId: 't1', line: '- [x] CALL MUM' });
  });

  it('builds an append note for a meal', () => {
    const note = buildNote('meal', { id: 'm1', date: '2026-07-16', name: 'Oatmeal', mealType: 'breakfast', calories: 350 }, 'create');
    expect(note).toEqual({
      kind: 'append', path: 'Daily Notes/2026-07-16.md', markerId: 'm1',
      line: '- breakfast: Oatmeal (350 cal)',
    });
  });

  it('builds an append note for a habit, with a header only when a name is present', () => {
    const withName = buildNote('habit', { habit_id: 'h1', date: '2026-07-16', completed: true, streak: 5, name: 'Meditate' }, 'update');
    expect(withName).toEqual({
      kind: 'append', path: 'Habits/h1.md', markerId: '2026-07-16',
      line: '- 2026-07-16: done (streak 5)', header: '# Meditate',
    });

    const withoutName = buildNote('habit', { habit_id: 'h1', date: '2026-07-16', completed: false, streak: 0 }, 'create');
    expect(withoutName?.kind === 'append' ? withoutName.header : undefined).toBeUndefined();
  });

  it('builds a replace note for a workout with a template name', () => {
    const note = buildNote('workout', { template_id: 'w1', template_name: 'Push Day', date: '2026-07-16' }, 'create');
    expect(note).toEqual({ kind: 'replace', path: 'Workouts/2026-07-16-w1.md', body: '# Push Day\n\nCompleted 2026-07-16.' });
  });

  it('builds a replace note for a goal milestone', () => {
    const note = buildNote('goal', { goal_id: 'g1', milestone_id: 'ms1', completed: true, title: 'Run a marathon' }, 'update');
    expect(note).toEqual({
      kind: 'replace', path: 'Goals/g1.md',
      body: '# Run a marathon\n\nMilestone ms1: completed.',
    });
  });

  it('builds a replace note for a finished book', () => {
    const note = buildNote('book', { id: 'b1', status: 'finished', title: 'Dune' }, 'update');
    expect(note).toEqual({ kind: 'replace', path: 'Library/Books/b1.md', body: '# Dune\n\nStatus: finished.' });
  });

  it('builds a replace note for a watched movie, including rating when present', () => {
    const note = buildNote('movie', { id: 'v1', status: 'watched', title: 'Dune', rating: 5 }, 'update');
    expect(note).toEqual({ kind: 'replace', path: 'Library/Movies/v1.md', body: '# Dune\n\nStatus: watched. Rating: 5/5.' });
  });
});

describe('buildNote — delete action', () => {
  it('removes just the meal line from its Daily Note, not the whole file', () => {
    const note = buildNote('meal', { id: 'm1', date: '2026-07-16' }, 'delete');
    expect(note).toEqual({ kind: 'removeLine', path: 'Daily Notes/2026-07-16.md', markerId: 'm1' });
  });

  it('returns null for entities that never delete today', () => {
    expect(buildNote('task', { id: 't1', date: '2026-07-16' }, 'delete')).toBeNull();
    expect(buildNote('habit', { habit_id: 'h1' }, 'delete')).toBeNull();
  });
});

describe('upsertMarkedLine', () => {
  it('appends a new line to an empty body', () => {
    expect(upsertMarkedLine('', 't1', '- [ ] Buy milk')).toBe('- [ ] Buy milk <!--id:t1-->');
  });

  it('appends without clobbering an existing different-marker line', () => {
    const existing = '- [ ] Buy milk <!--id:t1-->';
    expect(upsertMarkedLine(existing, 't2', '- [ ] Call mum')).toBe(
      '- [ ] Buy milk <!--id:t1-->\n- [ ] Call mum <!--id:t2-->',
    );
  });

  it('replaces the line with a matching marker in place (idempotent re-writes)', () => {
    const existing = '- [ ] Buy milk <!--id:t1-->\n- [ ] Call mum <!--id:t2-->';
    expect(upsertMarkedLine(existing, 't1', '- [x] Buy milk')).toBe(
      '- [x] Buy milk <!--id:t1-->\n- [ ] Call mum <!--id:t2-->',
    );
  });

  it('seeds a header only when the body is empty', () => {
    expect(upsertMarkedLine('', '2026-07-16', '- 2026-07-16: done', '# Meditate')).toBe(
      '# Meditate\n- 2026-07-16: done <!--id:2026-07-16-->',
    );
  });

  it('never re-seeds the header once other lines exist', () => {
    const existing = '# Meditate\n- 2026-07-16: done <!--id:2026-07-16-->';
    expect(upsertMarkedLine(existing, '2026-07-17', '- 2026-07-17: done', '# Meditate')).toBe(
      '# Meditate\n- 2026-07-16: done <!--id:2026-07-16-->\n- 2026-07-17: done <!--id:2026-07-17-->',
    );
  });
});

describe('removeMarkedLine', () => {
  it('removes only the matching line', () => {
    const existing = '- [ ] Buy milk <!--id:t1-->\n- [ ] Call mum <!--id:t2-->';
    expect(removeMarkedLine(existing, 't1')).toBe('- [ ] Call mum <!--id:t2-->');
  });

  it('returns an empty string when the only line is removed', () => {
    expect(removeMarkedLine('- [ ] Buy milk <!--id:t1-->', 't1')).toBe('');
  });

  it('is a no-op when the marker is not present', () => {
    const existing = '- [ ] Buy milk <!--id:t1-->';
    expect(removeMarkedLine(existing, 't2')).toBe(existing);
  });
});
