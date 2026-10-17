import { describe, it, expect } from 'vitest';
import {
  autoSplit, rotation, defaultDays, weekPlan, focusOfName, freshness, readiness, coachToday, systemicLoad,
  type Routine, type Vitals,
} from './coach';
import { toDateKey } from './dateKey';
import type { Session } from './muscle-recovery';

const H = 3_600_000;
// Wednesday 14 Oct 2026, 9am.
const NOW = new Date(2026, 9, 14, 9);
const ago = (h: number) => NOW.getTime() - h * H;
const lift = (name: string, hoursAgo: number, sets = 4): Session => ({
  exerciseId: name, name, muscleGroups: [], date: toDateKey(new Date(ago(hoursAgo))), at: ago(hoursAgo),
  sets, weightKg: 60, reps: 8, measured: true,
});
const day = (back: number) => toDateKey(new Date(2026, 9, 14 - back));
const series = (today: number, usual: number, jitter = 2) =>
  Object.fromEntries([[day(0), today], ...Array.from({ length: 20 }, (_, i) => [day(i + 1), usual + (i % 2 ? jitter : -jitter)])]);

describe('routine', () => {
  it('picks a split from the number of days', () => {
    expect([2, 3, 4, 5, 6].map(autoSplit)).toEqual(['full', 'full', 'ul', 'hybrid', 'ppl']);
  });
  it('adds a core day to a seven-day week', () => {
    expect(rotation({ days: defaultDays(7), split: 'auto' })).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs', 'core']);
  });
  it('spreads days and deals the rotation onto them', () => {
    const r: Routine = { days: defaultDays(4), split: 'auto' };
    expect(r.days).toEqual(['monday', 'tuesday', 'thursday', 'friday']);
    expect(weekPlan(r)).toMatchObject({ monday: 'upper', tuesday: 'lower', wednesday: 'rest', thursday: 'upper', friday: 'lower', sunday: 'rest' });
  });
  it('honours a chosen split', () => {
    expect(weekPlan({ days: ['monday', 'wednesday', 'friday'], split: 'ppl' })).toMatchObject({ monday: 'push', wednesday: 'pull', friday: 'legs' });
  });
  it('reads a focus from a template name', () => {
    expect(['PUSH DAY', 'LEGS DAY', 'UPPER BODY', 'FULL BODY', 'ARMS'].map(focusOfName)).toEqual(['push', 'legs', 'upper', 'full', null]);
  });
});

describe('freshness', () => {
  it('drops for the trained focus only', () => {
    const s = [lift('BENCH PRESS', 10), lift('OVERHEAD PRESS', 10), lift('TRICEP PUSHDOWN', 10)];
    expect(freshness('push', s, NOW.getTime())).toBeLessThan(50);
    expect(freshness('pull', s, NOW.getTime())).toBeGreaterThan(95);
  });
});

describe('readiness', () => {
  it('counts only load without a wearable, and says so', () => {
    const r = readiness(null, 0, NOW);
    expect(r.factors.map(f => f.id)).toEqual(['load']);
    expect(r.score).toBe(100);
    expect(r.level).toBe('train');
    expect(r.flags[0]).toMatch(/wearable/);
  });
  it('drops with low HRV, high resting HR and a short night', () => {
    const bad: Vitals = {
      hrv: series(38, 60), rhr: series(62, 52), resp: {}, spo2: null, sources: {},
      sleep: { [day(0)]: { asleep: 300, deep: 40, rem: 50, awake: 30 } },
    };
    const good: Vitals = { ...bad, hrv: series(66, 60), rhr: series(50, 52), sleep: { [day(0)]: { asleep: 470, deep: 90, rem: 100, awake: 10 } } };
    const rb = readiness(bad, 0.1, NOW), rg = readiness(good, 0.1, NOW);
    expect(rb.level).toBe('recover');
    expect(rg.score).toBeGreaterThan(75);
    expect(rg.level).toBe('push');
  });
  it('caps it when breathing rate is up', () => {
    const v: Vitals = { hrv: series(66, 60), rhr: series(50, 52), resp: series(17, 14, 0.3), sleep: {}, spo2: null, sources: {} };
    const r = readiness(v, 0, NOW);
    expect(r.score).toBeLessThanOrEqual(45);
    expect(r.flags[0]).toMatch(/ill/);
  });
  it('needs a few days of baseline before trusting HRV', () => {
    const v: Vitals = { hrv: { [day(0)]: 30, [day(1)]: 60 }, rhr: {}, resp: {}, sleep: {}, spo2: null, sources: {} };
    expect(readiness(v, 0, NOW).factors.map(f => f.id)).toEqual(['load']);
  });
});

describe('coachToday', () => {
  const ppl: Routine = { days: ['monday', 'wednesday', 'friday'], split: 'ppl' };

  it('follows the rotation, not the weekday, after a missed day', () => {
    // Plan says Wednesday is PULL, but Monday's PUSH was skipped: last done was LEGS last Friday.
    const t = coachToday({ routine: ppl, doneFoci: [{ focus: 'legs', date: day(5) }], sessions: [], vitals: null, now: NOW });
    expect(t.focus).toBe('push');
    expect(t.scheduled).toBe(true);
    expect(t.when).toBe('TODAY');
  });
  it('swaps to a fresher focus when the planned muscles are still tired', () => {
    const sessions = [lift('BARBELL ROW', 20, 5), lift('LAT PULLDOWN', 20, 5), lift('BARBELL CURL', 20, 4), lift('FACE PULL', 20, 4)];
    const t = coachToday({ routine: ppl, doneFoci: [{ focus: 'push', date: day(2) }], sessions, vitals: null, now: NOW });
    expect(t.planned).toBe('pull');
    expect(t.swapped).toBe(true);
    expect(t.focus).not.toBe('pull');
    expect(t.reasons[0]).toMatch(/recovered/);
  });
  it('moves on once today is done', () => {
    const t = coachToday({ routine: ppl, doneFoci: [{ focus: 'pull', date: day(0) }, { focus: 'push', date: day(2) }], sessions: [], vitals: null, now: NOW });
    expect(t.done).toBe(true);
    expect(t.focus).toBe('legs');
    expect(t.when).toBe('FRI');
  });
  it('turns a bad-readiness day into core and mobility', () => {
    const v: Vitals = { hrv: series(30, 60), rhr: series(64, 52), resp: {}, spo2: null, sources: {}, sleep: { [day(0)]: { asleep: 250, deep: 20, rem: 20, awake: 60 } } };
    const t = coachToday({ routine: ppl, doneFoci: [], sessions: [], vitals: v, now: NOW });
    expect(t.readiness.level).toBe('recover');
    expect(t.focus).toBe('core');
  });
  it('knows a rest day', () => {
    const t = coachToday({ routine: { days: ['monday', 'friday'], split: 'auto' }, doneFoci: [], sessions: [], vitals: null, now: NOW });
    expect(t.scheduled).toBe(false);
    expect(t.when).toBe('FRI');
    expect(t.focus).toBe('full');
  });
  it('systemic load rises with training', () => {
    expect(systemicLoad([], NOW.getTime())).toBe(0);
    expect(systemicLoad([lift('BACK SQUAT', 5), lift('BENCH PRESS', 5)], NOW.getTime())).toBeGreaterThan(0.05);
  });
});

describe('chips', () => {
  it('suggests lifts that fit the focus, without what is already in', async () => {
    const { suggestFor } = await import('./coach');
    const picks = suggestFor('push', [{ name: 'BENCH PRESS', muscleGroups: ['chest'] }], ['BENCH PRESS']).map(p => p.name);
    expect(picks).toContain('INCLINE DB PRESS');
    expect(picks).toContain('TRICEP PUSHDOWN');
    expect(picks).not.toContain('BENCH PRESS');
    expect(picks).not.toContain('LAT PULLDOWN');
  });
  it('offers same-muscle swaps', async () => {
    const { alternativesFor } = await import('./coach');
    const alts = alternativesFor({ name: 'LAT PULLDOWN', muscleGroups: ['lats'] }, [], []).map(p => p.name);
    expect(alts[0]).toMatch(/PULL UP|CHIN UP/);
    expect(alts).not.toContain('BACK SQUAT');
  });
});
