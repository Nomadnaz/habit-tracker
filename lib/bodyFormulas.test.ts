import { describe, it, expect } from 'vitest';
import {
  stepsThisYearFromHistory, trainingDayTypeFor, computeHeadlineLiftsFromData,
  computeStrengthTrendFromLifts, computeLeastTrainedMuscleFromData,
  computeNextSessionFromPlan, goalStatus, formatSleep,
} from './bodyFormulas';
import type { GymPlan } from './workout-data';

const EMPTY_PLAN: GymPlan = {
  monday: null, tuesday: null, wednesday: null, thursday: null,
  friday: null, saturday: null, sunday: null,
};

describe('stepsThisYearFromHistory', () => {
  it('sums only entries from the current year', () => {
    const year = new Date().getFullYear();
    const history = {
      [`${year}-01-01`]: 1000,
      [`${year}-06-15`]: 2000,
      [`${year - 1}-12-31`]: 5000,
    };
    expect(stepsThisYearFromHistory(history)).toBe(3000);
  });

  it('returns 0 for an empty history', () => {
    expect(stepsThisYearFromHistory({})).toBe(0);
  });
});

describe('trainingDayTypeFor', () => {
  it('returns trained when the day is in doneDates', () => {
    const monday = new Date(2026, 6, 6); // a Monday
    const doneDates = new Set(['2026-07-06']);
    expect(trainingDayTypeFor(monday, doneDates, EMPTY_PLAN)).toBe('trained');
  });

  it('returns rest/cheat from the gym plan when not done', () => {
    const monday = new Date(2026, 6, 6);
    const plan: GymPlan = { ...EMPTY_PLAN, monday: 'rest' };
    expect(trainingDayTypeFor(monday, new Set(), plan)).toBe('rest');
    const plan2: GymPlan = { ...EMPTY_PLAN, monday: 'cheat' };
    expect(trainingDayTypeFor(monday, new Set(), plan2)).toBe('cheat');
  });

  it('returns missed when neither done nor planned', () => {
    const monday = new Date(2026, 6, 6);
    expect(trainingDayTypeFor(monday, new Set(), EMPTY_PLAN)).toBe('missed');
  });
});

describe('computeHeadlineLiftsFromData', () => {
  const exercises = [{ id: 'e1', name: 'BENCH PRESS', weightKg: 80 }];

  it('omits a lift the user has not created', () => {
    const out = computeHeadlineLiftsFromData([], [], '2026-07-07');
    expect(out).toEqual([]);
  });

  it('reports the exercise weight with an empty history when no PBs logged', () => {
    const out = computeHeadlineLiftsFromData(exercises, [], '2026-07-07');
    expect(out).toEqual([
      { name: 'BENCH PRESS', icon: 'weight-lifter', topSetKg: 80, deltaKg: 0, history: [] },
    ]);
  });

  it('computes topSetKg and a 90-day delta from real PB history', () => {
    const pbLog = [
      { exerciseId: 'e1', weightKg: 70, date: '2026-05-01' },
      { exerciseId: 'e1', weightKg: 85, date: '2026-06-01' },
    ];
    const out = computeHeadlineLiftsFromData(exercises, pbLog, '2026-07-07');
    expect(out[0].topSetKg).toBe(85);
    expect(out[0].deltaKg).toBe(15);
    expect(out[0].history).toEqual([70, 85]);
  });

  it('does not compute a delta from fewer than 2 PB entries in the 90-day window', () => {
    const pbLog = [{ exerciseId: 'e1', weightKg: 70, date: '2026-01-01' }];
    const out = computeHeadlineLiftsFromData(exercises, pbLog, '2026-07-07');
    expect(out[0].deltaKg).toBe(0);
  });
});

describe('computeStrengthTrendFromLifts', () => {
  it('returns null when no lift has 2+ history entries', () => {
    const lifts = [{ name: 'BENCH', icon: '', topSetKg: 80, deltaKg: 0, history: [80] }];
    expect(computeStrengthTrendFromLifts(lifts)).toBeNull();
  });

  it('averages % change across qualifying lifts and uses the richest history for the sparkline', () => {
    const lifts = [
      { name: 'BENCH', icon: '', topSetKg: 100, deltaKg: 10, history: [90, 100] },      // +11.1%
      { name: 'SQUAT', icon: '', topSetKg: 150, deltaKg: 30, history: [100, 120, 150] }, // +50%
    ];
    const trend = computeStrengthTrendFromLifts(lifts);
    expect(trend).not.toBeNull();
    expect(trend!.pct).toBe(Math.round((11.11 + 50) / 2));
    expect(trend!.history).toEqual([100, 120, 150]); // SQUAT has more entries
  });
});

describe('computeLeastTrainedMuscleFromData', () => {
  it('returns null when the user has no exercises at all', () => {
    expect(computeLeastTrainedMuscleFromData([], [])).toBeNull();
  });

  it('surfaces an untouched muscle group as least-trained even with zero recent sessions', () => {
    const allExercises = [
      { muscleGroups: ['chest' as const] },
      { muscleGroups: ['calves' as const] },
    ];
    const out = computeLeastTrainedMuscleFromData([], allExercises);
    // both are 0 — first encountered in Set iteration order wins, just assert it's one of them
    expect(['chest', 'calves']).toContain(out?.name);
    expect(out?.sessionsInLast28Days).toBe(0);
  });

  it('weights a multi-group exercise by 1/groupCount and finds the lower-count group', () => {
    const allExercises = [{ muscleGroups: ['chest' as const, 'triceps' as const] }, { muscleGroups: ['back' as const] }];
    const recent = [
      [{ muscleGroups: ['chest' as const, 'triceps' as const] }], // 1 session, split 0.5/0.5
    ];
    const out = computeLeastTrainedMuscleFromData(recent, allExercises);
    expect(out?.name).toBe('back'); // 0 sessions vs 0.5 for chest/triceps
    expect(out?.sessionsInLast28Days).toBe(0);
  });
});

describe('computeNextSessionFromPlan', () => {
  it('returns null when tomorrow is unplanned', () => {
    const tomorrow = new Date(2026, 6, 8); // a Wednesday
    expect(computeNextSessionFromPlan(EMPTY_PLAN, tomorrow)).toBeNull();
  });

  it('returns null for a rest or cheat day', () => {
    const tomorrow = new Date(2026, 6, 8);
    expect(computeNextSessionFromPlan({ ...EMPTY_PLAN, wednesday: 'rest' }, tomorrow)).toBeNull();
  });

  it('returns the planned movement day', () => {
    const tomorrow = new Date(2026, 6, 8); // Wednesday
    const out = computeNextSessionFromPlan({ ...EMPTY_PLAN, wednesday: 'pull' }, tomorrow);
    expect(out).toEqual({ name: 'PULL DAY', when: 'TOMORROW' });
  });
});

describe('goalStatus', () => {
  it('buckets percentages into GOOD/ALMOST/OK/LOW', () => {
    expect(goalStatus(1)).toBe('GOOD');
    expect(goalStatus(0.85)).toBe('ALMOST');
    expect(goalStatus(0.6)).toBe('OK');
    expect(goalStatus(0.2)).toBe('LOW');
  });
});

describe('formatSleep', () => {
  it('renders an em dash for null (no real data) instead of a fake duration', () => {
    expect(formatSleep(null)).toBe('—');
  });

  it('formats real minutes as H M', () => {
    expect(formatSleep(462)).toBe('7H 42M');
  });
});
