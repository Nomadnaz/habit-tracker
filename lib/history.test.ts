import { describe, expect, it } from 'vitest';
import { buildHistory } from './history';
import type { Session } from './muscle-recovery';

const s = (date: string, name: string, sets = 3): Session => ({
  exerciseId: name, name, muscleGroups: [], date, at: 0, sets, weightKg: 50, reps: 10, measured: false,
});

describe('buildHistory', () => {
  it('groups by day newest first, names days after ticked templates, skips cardio', () => {
    const out = buildHistory(
      [s('2026-10-19', 'BENCH PRESS'), s('2026-10-20', 'SQUAT'), s('2026-10-20', 'RUN'), s('2026-10-19', 'OHP')],
      [{ date: '2026-10-19', templateId: 't1' }],
      [{ id: 't1', name: 'PUSH DAY', colour: '#fff', isArchived: false }],
    );
    expect(out.map(d => d.date)).toEqual(['2026-10-20', '2026-10-19']);
    expect(out[0].title).toBe('TRAINING');
    expect(out[0].lifts.map(l => l.name)).toEqual(['SQUAT']);
    expect(out[1].title).toBe('PUSH DAY');
  });

  it('scales muscle load to the day’s most-worked muscle', () => {
    const [day] = buildHistory([s('2026-10-19', 'BENCH PRESS')], [], []);
    const vals = Object.values(day.load);
    expect(Math.max(...vals)).toBe(1);
    expect(day.load['pec.lower'] ?? day.load['pec.upper']).toBeGreaterThan(0);
    expect(day.load['quad.rf']).toBeUndefined();
  });
});
