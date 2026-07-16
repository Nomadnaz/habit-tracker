import { describe, it, expect } from 'vitest';
import { computeSleepTrend } from './trends';

const nights = (hoursByOffset: Record<number, number>): { date: string; total_hours: number }[] => {
  const base = new Date('2026-07-16T00:00:00Z');
  return Object.entries(hoursByOffset).map(([offset, hours]) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() - Number(offset));
    return { date: d.toISOString().slice(0, 10), total_hours: hours };
  });
};

describe('computeSleepTrend', () => {
  it('returns null with no data', () => {
    expect(computeSleepTrend([])).toBeNull();
  });

  it('returns null when either window has too few nights logged', () => {
    const logs = nights({ 0: 7, 1: 7, 2: 7 }); // only 3 nights total
    expect(computeSleepTrend(logs)).toBeNull();
  });

  it('reports a downward trend when recent avg is meaningfully lower', () => {
    const logs = nights({
      0: 5, 1: 5, 2: 5, 3: 5, 4: 5, 5: 5, 6: 5, // recent week: 5h avg
      7: 8, 8: 8, 9: 8, 10: 8, 11: 8, 12: 8, 13: 8, // prior week: 8h avg
    });
    const trend = computeSleepTrend(logs);
    expect(trend).toContain('down');
    expect(trend).toContain('5.0h');
    expect(trend).toContain('8.0h');
  });

  it('reports an upward trend when recent avg is meaningfully higher', () => {
    const logs = nights({
      0: 8, 1: 8, 2: 8, 3: 8, 4: 8, 5: 8, 6: 8,
      7: 5, 8: 5, 9: 5, 10: 5, 11: 5, 12: 5, 13: 5,
    });
    expect(computeSleepTrend(logs)).toContain('up');
  });

  it('reports steady when the delta is within the stable threshold', () => {
    const logs = nights({
      0: 7, 1: 7, 2: 7.2, 3: 7, 4: 7, 5: 7.1, 6: 7,
      7: 7.1, 8: 7, 9: 6.9, 10: 7, 11: 7, 12: 7, 13: 7,
    });
    expect(computeSleepTrend(logs)).toContain('steady');
  });

  it('ignores null/zero/missing total_hours entries', () => {
    const logs = [
      ...nights({ 0: 7, 1: 7, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 7, 8: 7, 9: 7, 10: 7, 11: 7, 12: 7, 13: 7 }),
      { date: '2026-07-01', total_hours: null },
      { date: '2026-06-30', total_hours: 0 },
    ];
    expect(computeSleepTrend(logs)).toContain('steady');
  });
});
