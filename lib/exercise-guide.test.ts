import { describe, it, expect } from 'vitest';
import { guideFor, patternOf, equipmentOf, goalOf, videoUrl, nextWeight, snapWeight, shiftReps } from './exercise-guide';
import { CATALOGUE } from './muscle-recovery';

const me = { goal: 'size' as const, bodyKg: 80, heightCm: 180, sex: 'Male' };

describe('patterns', () => {
  it('knows every catalogue lift', () => {
    expect(CATALOGUE.map(([n]) => n).filter(n => patternOf(n) === 'stand')).toEqual([]);
  });
  it('reads the kit from the name', () => {
    expect(patternOf('WALKING LUNGE')).toBe('lunge');
    expect(patternOf('LAT PULLDOWN')).toBe('pulldown');
    expect(patternOf('CHIN UP')).toBe('pullup');
    expect(equipmentOf('INCLINE DB PRESS', 'bench')).toBe('dumbbell');
    expect(equipmentOf('TRICEP PUSHDOWN', 'pushdown')).toBe('cable');
    expect(equipmentOf('PULL UP', 'pullup')).toBe('bodyweight');
  });
});

describe('starting weight', () => {
  it('from bodyweight for a novice, scaled to the goal', () => {
    expect(guideFor('BENCH PRESS', me)).toMatchObject({ startKg: 35, reps: [8, 12], basis: 'bodyweight', perHand: false });
    expect(guideFor('BENCH PRESS', { ...me, goal: 'strength' }).startKg).toBe(40);
    expect(guideFor('DUMBBELL BENCH PRESS', me)).toMatchObject({ startKg: 12, perHand: true });
  });
  it('caps bodyweight at BMI 25 and scales for women', () => {
    expect(guideFor('BACK SQUAT', { ...me, bodyKg: 130 }).startKg).toBe(guideFor('BACK SQUAT', { ...me, bodyKg: 81 }).startKg);
    expect(guideFor('BENCH PRESS', { ...me, sex: 'Female' }).startKg).toBeLessThan(35);
  });
  it('prefers your own history', () => {
    const g = guideFor('BENCH PRESS', { ...me, bestE1rmKg: 100 });
    expect(g.basis).toBe('history');
    expect(g.startKg).toBe(67.5); // 100 / (1 + 10/30) × 0.9
  });
  it('bodyweight moves have no load', () => {
    expect(guideFor('PULL UP', me)).toMatchObject({ startKg: null, equipment: 'bodyweight' });
  });
});

describe('goals and links', () => {
  it('maps category names to rep schemes', () => {
    expect(goalOf('STRENGTH')).toBe('strength');
    expect(goalOf('PAIN')).toBe('easy');
    expect(goalOf('GROW')).toBe('size');
    expect(goalOf(null)).toBe('size');
  });
  it('searches YouTube', () => {
    expect(videoUrl('BENCH PRESS')).toBe('https://www.youtube.com/results?search_query=BENCH%20PRESS%20proper%20form%20tutorial');
  });
});

describe('difficulty', () => {
  it('reads reps in reserve off a 1RM', async () => {
    const { difficulty } = await import('./exercise-guide');
    // 100 kg 1RM: 75 kg is ~10 reps possible.
    expect(difficulty(75, 6, 100)?.word).toBe('EASY');
    expect(difficulty(75, 8, 100)?.word).toBe('MODERATE');
    expect(difficulty(75, 10, 100)?.word).toBe('MAX');
    expect(difficulty(100, 5, 100)?.word).toBe('TOO HEAVY');
    expect(difficulty(100, 5, 100)!.level).toBe(1);
    expect(difficulty(0, 5, 100)).toBeNull();
  });
  it('estimates a 1RM from the guide when there is no history', async () => {
    const { e1rmFor, guideFor, difficulty } = await import('./exercise-guide');
    const g = guideFor('BENCH PRESS', { goal: 'size', bodyKg: 80, heightCm: 180, sex: 'male' });
    const e = e1rmFor(g)!;
    expect(e.measured).toBe(false);
    // The recommended start is comfortably doable for the top of the range.
    expect(['EASY', 'MODERATE']).toContain(difficulty(g.startKg!, g.reps[1], e.kg)!.word);
    // A seeded 100 kg bench is not.
    expect(['MAX', 'TOO HEAVY']).toContain(difficulty(100, g.reps[1], e.kg)!.word);
  });
});

describe('steppers', () => {
  const lb = (kg: number) => Math.round(kg * 2.2046226218 * 100) / 100;
  it('moves a bar by 2.5 kg and lands off-grid weights on the grid first', () => {
    expect(nextWeight(60, 1, 'barbell', 'metric')).toBe(62.5);
    expect(nextWeight(62.5, -1, 'barbell', 'metric')).toBe(60);
    expect(nextWeight(61.3, 1, 'barbell', 'metric')).toBe(62.5);
    expect(nextWeight(61.3, -1, 'barbell', 'metric')).toBe(60);
    expect(nextWeight(60, 4, 'barbell', 'metric')).toBe(70);
    expect(nextWeight(1, -1, 'barbell', 'metric')).toBe(0);
  });
  it('steps dumbbells 1 kg to 10, 2 kg after — the same either way', () => {
    expect([8, 9, 10, 12].map(k => nextWeight(k, 1, 'dumbbell', 'metric'))).toEqual([9, 10, 12, 14]);
    expect([14, 12, 10, 9].map(k => nextWeight(k, -1, 'dumbbell', 'metric'))).toEqual([12, 10, 9, 8]);
    expect(nextWeight(11, -1, 'dumbbell', 'metric')).toBe(10);
  });
  it('steps 5 lb in imperial, round trip clean', () => {
    const k45 = nextWeight(40 / 2.2046226218, 1, 'barbell', 'imperial');
    expect(lb(k45)).toBe(45);
    expect(lb(nextWeight(k45, -1, 'barbell', 'imperial'))).toBe(40);
    expect(lb(nextWeight(20, 1, 'barbell', 'imperial'))).toBe(45); // 44.09 lb → 45
    expect(lb(snapWeight(22.5, 'barbell', 'imperial'))).toBe(50);
  });
  it('shifts a rep range whole and never collapses it', () => {
    expect(shiftReps('8-12', 1)).toBe('9-13');
    expect(shiftReps('2-6', -3)).toBe('1-5');
    expect(shiftReps('1-5', -1)).toBe('1-5');
    expect(shiftReps('12', -1)).toBe('11');
    expect(shiftReps('46-50', 1)).toBe('46-50');
  });
});
