import { describe, it, expect } from 'vitest';
import { bests, climb, fmtElapsed, recentClimbs, weekHours, weekStart } from './climb';
import { toDateKey } from './dateKey';

// Wednesday 14 Oct 2026, 3pm.
const NOW = new Date(2026, 9, 14, 15);
const MON = weekStart(NOW);

describe('weekStart', () => {
  it('is Monday midnight', () => {
    expect(MON.getDay()).toBe(1);
    expect(toDateKey(MON)).toBe('2026-10-12');
  });
});

describe('climb', () => {
  it('times each checkpoint to the hour, interpolated', () => {
    const hours = Array(168).fill(0);
    hours[9] = 8000;       // Mon 9am
    hours[33] = 4000;      // Tue 9am → crosses 10K halfway through
    const c = climb(MON, hours);
    expect(c.total).toBe(12000);
    expect(c.reached[0]).toBe(33.5 * 3_600_000);
    expect(c.reached[1]).toBeNull();
  });
});

describe('weekHours', () => {
  it('uses hourly buckets, and spreads a day that only has a total', () => {
    const daily = { '2026-10-12': 16000, '2026-10-13': 3000 };
    const hourly = { '2026-10-13T08': 3000 };
    const h = weekHours(MON, daily, hourly, NOW);
    expect(h.slice(0, 24).reduce((a, b) => a + b, 0)).toBeCloseTo(16000);
    expect(h[7]).toBeCloseTo(1000);
    expect(h[24 + 8]).toBe(3000);
  });
});

describe('bests', () => {
  it('keeps the fastest per checkpoint, including earlier bests', () => {
    const daily = Object.fromEntries(Array.from({ length: 21 }, (_, i) => [toDateKey(new Date(2026, 9, 14 - i)), 15000]));
    const cs = recentClimbs(daily, {}, NOW, 3);
    const b = bests(cs, [{ ms: 3_600_000, week: 0 }]);
    expect(b[0]).toEqual({ ms: 3_600_000, week: 0 });
    expect(b[1]).not.toBeNull();
    expect(b[3]).not.toBeNull(); // 7 × 15K tops 100K in a full week
  });
});

describe('fmtElapsed', () => {
  it('reads like a split', () => {
    expect(fmtElapsed(2 * 86_400_000 + 14 * 3_600_000)).toBe('2D 14H');
    expect(fmtElapsed(9 * 3_600_000 + 5 * 60_000)).toBe('9H 05M');
    expect(fmtElapsed(42 * 60_000)).toBe('42M');
  });
});
