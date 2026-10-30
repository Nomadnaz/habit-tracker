import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));
import { fillMissed } from './missed-days';

describe('missed days', () => {
  it('fills a missed day with the average of the logged days', () => {
    expect(fillMissed({ '2026-10-20': 2000, '2026-10-21': 2400 }, ['2026-10-22'])).toEqual({
      '2026-10-20': 2000, '2026-10-21': 2400, '2026-10-22': 2200,
    });
  });

  it('keeps what was logged on a day marked missed, and leaves unmarked gaps alone', () => {
    const out = fillMissed({ '2026-10-20': 2000, '2026-10-22': 600 }, ['2026-10-22']);
    expect(out['2026-10-22']).toBe(600);
    expect(out['2026-10-21']).toBeUndefined();
  });

  it('has nothing to average with no logged days', () => {
    expect(fillMissed({}, ['2026-10-22'])).toEqual({});
  });
});
