import { describe, it, expect } from 'vitest';
import { buildTwin, directive, type TwinInput } from './twin';
import { coachToday, type Routine, type Vitals } from './coach';
import { toDateKey } from './dateKey';
import type { Session } from './muscle-recovery';

const H = 3_600_000;
// Wednesday 14 Oct 2026, 9am.
const NOW = new Date(2026, 9, 14, 9);
const day = (back: number) => toDateKey(new Date(2026, 9, 14 - back));
const lift = (name: string, hoursAgo: number, sets = 4): Session => ({
  exerciseId: name, name, muscleGroups: [], date: toDateKey(new Date(NOW.getTime() - hoursAgo * H)), at: NOW.getTime() - hoursAgo * H,
  sets, weightKg: 60, reps: 8, measured: true,
});
const series = (today: number, usual: number) =>
  Object.fromEntries([[day(0), today], ...Array.from({ length: 20 }, (_, i) => [day(i + 1), usual + (i % 2 ? 2 : -2)])]);
const every = (v: number, n = 7) => Object.fromEntries(Array.from({ length: n }, (_, i) => [day(i + 1), v]));

const ROUTINE: Routine = { days: ['monday', 'wednesday', 'friday'], split: 'ppl' };

function input(over: Partial<TwinInput> = {}, opts: { vitals?: Vitals | null; sessions?: Session[]; routine?: Routine } = {}): TwinInput {
  const sessions = opts.sessions ?? [];
  const routine = opts.routine ?? ROUTINE;
  const coach = coachToday({ routine, doneFoci: [], sessions, vitals: opts.vitals ?? null, now: NOW });
  return {
    now: NOW, goal: { id: 'health', pace: 'steady' },
    profile: { age: 30, sex: 'Male', heightCm: 180, weightKg: 80, goalWeightKg: null },
    weights: [], steps: every(9000), water: {}, eaten: {}, sleep: {}, wake: '07:00', runsKm: {},
    coach, routine, sessions, ...over,
  };
}

describe('fuel', () => {
  it('cuts for abs and eats more on a training day than a rest day', () => {
    const t = buildTwin(input({ goal: { id: 'abs', pace: 'fast' } }));
    expect(t.fuel.value).toBeLessThan(t.fuel.burn * 0.8);
    const today = t.week[0], rest = t.week.find(d => !d.focus)!;
    expect(today.focus).not.toBeNull();
    expect(today.kcal).toBeGreaterThan(rest.kcal);
    expect(t.fuel.proteinG).toBe(176); // 2.2 g/kg
  });
  it('builds with a surplus', () => {
    const t = buildTwin(input({ goal: { id: 'build', pace: 'steady' } }));
    expect(t.fuel.value).toBeGreaterThan(t.fuel.burn);
  });
  it('eases the deficit after a short night', () => {
    const rested = buildTwin(input({ goal: { id: 'abs', pace: 'max' }, sleep: { [day(0)]: 480 } }));
    const short = buildTwin(input({ goal: { id: 'abs', pace: 'max' }, sleep: { [day(0)]: 300 } }));
    expect(short.fuel.value).toBeGreaterThan(rested.fuel.value);
    expect(short.fuel.lines.some(l => /SHORT NIGHT/.test(l.label))).toBe(true);
  });
  it('pays back half of yesterday’s overeating', () => {
    const t = buildTwin(input({ eaten: { [day(1)]: 4500 } }));
    const line = t.fuel.lines.find(l => /OVER YESTERDAY/.test(l.label));
    expect(line?.delta).toBe(-300);
  });
  it('adds food back when the scale is dropping too fast', () => {
    const weights = [0, 5, 10, 15].map(d => ({ kg: 84 - d * 0.25, at: new Date(NOW.getTime() - (15 - d) * 86_400_000).toISOString() }));
    const t = buildTwin(input({ goal: { id: 'cut', pace: 'steady' }, weights }));
    expect(t.fuel.lines.some(l => /KEEP MUSCLE/.test(l.label))).toBe(true);
  });
  it('lines add up to the target', () => {
    const t = buildTwin(input({ goal: { id: 'abs', pace: 'fast' }, eaten: { [day(1)]: 3800 } }));
    expect(Math.abs(t.fuel.lines.reduce((a, l) => a + l.delta, 0) - t.fuel.value)).toBeLessThanOrEqual(10);
  });
});

describe('steps', () => {
  it('ramps from your own average instead of jumping to the goal', () => {
    const t = buildTwin(input({ goal: { id: 'abs', pace: 'steady' }, steps: every(4000) }));
    expect(t.steps.value).toBe(5500);
  });
  it('takes some off when the legs are spent', () => {
    const fresh = buildTwin(input());
    const legs = buildTwin(input({}, { sessions: [lift('BACK SQUAT', 12, 6), lift('LEG PRESS', 12, 6), lift('STANDING CALF RAISE', 12, 6)] }));
    expect(legs.steps.value).toBeLessThan(fresh.steps.value);
  });
});

describe('sleep', () => {
  it('pays back half the debt and counts bedtime back from waking', () => {
    const t = buildTwin(input({ sleep: { [day(0)]: 360, [day(1)]: 420, [day(2)]: 480 }, wake: '06:30' }));
    // 3h of debt → half is 90 min, capped at an hour.
    expect(t.sleep.value).toBe(540);
    expect(t.sleep.bed).toBe('21:15');
  });
  it('adds time when HRV is down', () => {
    const v: Vitals = { hrv: series(35, 60), rhr: {}, resp: {}, sleep: {}, spo2: null, sources: {} };
    const t = buildTwin(input({}, { vitals: v }));
    expect(t.sleep.lines.some(l => l.label === 'HRV LOW')).toBe(true);
  });
});

describe('water', () => {
  it('scales with weight and adds for training', () => {
    const t = buildTwin(input());
    expect(t.water.lines[0].delta).toBe(2750);
    expect(t.water.lines.some(l => l.label === 'TRAINING TODAY')).toBe(true);
  });
});

describe('week + outlook', () => {
  it('deals the rotation onto the coming training days', () => {
    const t = buildTwin(input());
    expect(t.week.map(d => d.dow)).toEqual(['TODAY', 'THU', 'FRI', 'SAT', 'SUN', 'MON', 'TUE']);
    expect(t.week.filter(d => d.focus).length).toBe(3);
    expect(t.week[1].focus).toBeNull();
  });
  it('gives abs a date', () => {
    const t = buildTwin(input({ goal: { id: 'abs', pace: 'fast' }, profile: { age: 30, sex: 'Male', heightCm: 178, weightKg: 88, goalWeightKg: null } }));
    expect(t.outlook.weeks).toBeGreaterThan(4);
    expect(t.outlook.weeks).toBeLessThan(60);
    expect(t.outlook.targetFat).toBe(12);
  });
  it('says what it had to guess', () => {
    const t = buildTwin(input({ profile: { age: null, sex: null, heightCm: null, weightKg: null, goalWeightKg: null } }));
    expect(t.assumed).toEqual(['weight', 'height', 'age']);
  });
  it('writes a one-line day', () => {
    const i = input({ goal: { id: 'abs', pace: 'fast' } });
    expect(directive(buildTwin(i), i.coach)).toMatch(/^Pull day at \d+% fresh\. Eat [\d,]+ kcal, \d+ g protein, walk [\d,]+, drink [\d.]+ L, bed by \d\d:\d\d\.$/);
  });
});
