import { describe, it, expect } from 'vitest';
import { guideFor, patternOf, equipmentOf, goalOf, videoUrl } from './exercise-guide';
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
