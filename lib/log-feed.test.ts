import { describe, expect, it } from 'vitest';
import { buildFeed, type FeedInput } from './log-feed';

const empty: FeedInput = { meals: [], sessions: [], water: [], weight: [], sleep: [], mood: [] };
const now = new Date(2026, 9, 25, 14, 0);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m);

describe('log feed', () => {
  it('groups by day, newest first, and names today and yesterday', () => {
    const feed = buildFeed({
      ...empty,
      meals: [
        { id: 'a', name: 'EGGS', calories: 310.4, createdAt: at(25, 8).toISOString(), loggedVia: 'ai_text' },
        { id: 'b', name: 'PASTA', calories: 700, createdAt: at(24, 19).toISOString(), loggedVia: 'manual' },
      ],
      water: [{ amountMl: 250, at: at(25, 12).toISOString() }],
      weight: [{ weightKg: 72.45, at: at(22, 7).toISOString() }],
    }, now);
    expect(feed.map(d => d.word)).toEqual(['TODAY', 'YESTERDAY', 'THU 22 OCT']);
    expect(feed[0].items.map(i => i.text)).toEqual(['Water', 'EGGS']);
    expect(feed[0].items[1]).toMatchObject({ kind: 'fuel', value: '310 KCAL', via: 'AI' });
    expect(feed[2].items[0].value).toBe('72.5 KG');
  });

  it('puts a meal on the day it was eaten, not the day it was typed in', () => {
    const feed = buildFeed({
      ...empty,
      meals: [{ id: 'c', name: 'CURRY', calories: 800, createdAt: at(25, 9).toISOString(), loggedVia: 'manual', date: '2026-10-24' }],
    }, now);
    expect(feed.map(d => d.word)).toEqual(['YESTERDAY']);
    expect(new Date(feed[0].items[0].at).getHours()).toBe(9);
  });

  it('drops anything older than the window or in the future', () => {
    const feed = buildFeed({
      ...empty,
      water: [
        { amountMl: 500, at: at(18, 9).toISOString() },
        { amountMl: 500, at: at(19, 9).toISOString() },
        { amountMl: 500, at: at(25, 20).toISOString() },
      ],
    }, now);
    expect(feed.map(d => d.date)).toEqual(['2026-10-19']);
  });

  it('lifts show sets × reps and weight, marked PUCK when measured; sleep sits at wake-up', () => {
    const feed = buildFeed({
      ...empty,
      sessions: [
        { exerciseId: 'x', name: 'BENCH PRESS', date: '2026-10-25', at: at(25, 10).getTime(), sets: 3, weightKg: 60, reps: 8, measured: true },
        { exerciseId: 'y', name: 'PUSH UP', date: '2026-10-25', at: at(25, 9).getTime(), sets: 2, weightKg: 0, reps: null, measured: false },
      ],
      sleep: [{ id: 's', date: '2026-10-25', wakeTime: '06:45', totalHours: 7.36, createdAt: at(25, 11).toISOString() }],
    }, now);
    expect(feed[0].items.map(i => [i.text, i.value, i.via ?? ''])).toEqual([
      ['BENCH PRESS', '3×8 · 60 KG', 'PUCK'],
      ['PUSH UP', '2×?', ''],
      ['Slept', '7.4 H', ''],
    ]);
  });
});
