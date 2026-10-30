import { describe, expect, it } from 'vitest';
import { blankDays, dayMarks } from './train-days';
import type { GymPlan } from './workout-data';

const plan: GymPlan = { monday: 'push', tuesday: 'rest', wednesday: 'pull', thursday: 'rest', friday: 'legs', saturday: 'rest', sunday: 'rest' };

describe('train days', () => {
  // 2026-10-30 is a Friday.
  const marks = dayMarks({
    today: '2026-10-30', back: 5, ahead: 3,
    liftDays: ['2026-10-26'], runDays: ['2026-10-28'], loggedDays: ['2026-10-25', '2026-10-30'], missed: ['2026-10-27'],
    plan,
  });

  it('marks lifts, runs, logs and missed days, and plans only from today', () => {
    expect(marks.map(m => m.date)).toEqual([
      '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ]);
    expect(marks[1]).toMatchObject({ lifted: true, logged: true, plan: null });
    expect(marks[2]).toMatchObject({ missed: true, logged: false });
    expect(marks[3]).toMatchObject({ ran: true, logged: true });
    expect(marks[5].plan).toBe('legs');
    expect(marks[8].plan).toBe('push');
  });

  it('finds the blank days since logging began', () => {
    expect(blankDays(marks, '2026-10-30')).toEqual(['2026-10-29']);
  });
});
