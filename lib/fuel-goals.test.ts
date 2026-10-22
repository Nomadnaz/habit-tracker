import { describe, expect, it } from 'vitest';
import { judgeDay, monthDays, streak, tally } from './fuel-goals';
import type { Meal } from './meals-data';

const meal = (date: string, calories: number, proteinG = 0, sugarG = 0): Meal =>
  ({ id: date + calories, date, mealType: 'lunch', name: 'x', calories, proteinG, carbsG: 0, fatG: 0, sugarG, loggedVia: 'manual', createdAt: '' } as Meal);

describe('judgeDay', () => {
  it('floor: hit at goal, halfway from 50%', () => {
    expect(judgeDay(120, 120, 'floor')).toBe('hit');
    expect(judgeDay(60, 120, 'floor')).toBe('half');
    expect(judgeDay(59, 120, 'floor')).toBe('miss');
  });
  it('plan: hit in 90–115%, over is a miss', () => {
    expect(judgeDay(1800, 2000, 'plan')).toBe('hit');
    expect(judgeDay(2300, 2000, 'plan')).toBe('hit');
    expect(judgeDay(2400, 2000, 'plan')).toBe('miss');
    expect(judgeDay(1200, 2000, 'plan')).toBe('half');
  });
  it('limit: under is a hit, a little over is halfway', () => {
    expect(judgeDay(40, 50, 'limit')).toBe('hit');
    expect(judgeDay(60, 50, 'limit')).toBe('half');
    expect(judgeDay(80, 50, 'limit')).toBe('miss');
  });
});

describe('monthDays', () => {
  const today = new Date(2026, 9, 22);
  const map = {
    '2026-10-01': [meal('2026-10-01', 500, 130)],
    '2026-10-02': [meal('2026-10-02', 500, 70)],
    '2026-10-03': [meal('2026-10-03', 500, 10)],
    '2026-10-21': [meal('2026-10-21', 500, 125)],
    '2026-10-22': [meal('2026-10-22', 500, 40)],
  };
  const days = monthDays(map, 'proteinG', 120, today, today);
  it('judges logged days, leaves unlogged and future days as none', () => {
    expect(days).toHaveLength(31);
    expect(days.slice(0, 4).map(d => d.status)).toEqual(['hit', 'half', 'miss', 'none']);
    expect(days[22].future).toBe(true);
  });
  it("treats today's shortfall as in progress", () => {
    expect(days[21].status).toBe('none');
  });
  it('tallies only past days', () => {
    expect(tally(days)).toEqual({ hit: 2, half: 1, miss: 1, none: 18 });
  });
  it('counts a streak back from yesterday when today is not hit yet', () => {
    expect(streak(map, 'proteinG', 120, today)).toBe(1);
  });
});
