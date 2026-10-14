import { describe, it, expect } from 'vitest';
import { musclesFor, muscleStatus, type Session } from './muscle-recovery';

const H = 3_600_000;
const NOW = 1_000 * H;
const s = (name: string, hoursAgo: number, sets = 4, groups: Session['muscleGroups'] = []): Session => ({
  exerciseId: name, name, muscleGroups: groups, date: '2026-10-14', at: NOW - hoursAgo * H,
  sets, weightKg: 60, reps: 8, measured: true,
});

describe('musclesFor', () => {
  it('routes by name before group', () => {
    expect(musclesFor('INCLINE DB PRESS', ['chest', 'shoulders'])['pec.upper']).toBe(1);
    expect(musclesFor('FACE PULL', ['shoulders'])['delt.rear']).toBe(1);
    expect(musclesFor('LEG CURL', ['hamstrings'])['biceps']).toBeUndefined();
  });
  it('falls back to muscle groups, first group as prime mover', () => {
    const m = musclesFor('MYSTERY MACHINE', ['quads', 'glutes']);
    expect(m['quad.vl']).toBe(1);
    expect(m['glute.max']).toBeCloseTo(0.7);
  });
});

describe('muscleStatus', () => {
  it('is full with no training', () => {
    expect(muscleStatus('pec.lower', [], NOW)).toMatchObject({ pct: 100, readyAt: null, lastAt: null });
  });
  it('drains on a hard session and recharges over time', () => {
    const just = muscleStatus('pec.lower', [s('BENCH PRESS', 0)], NOW);
    const later = muscleStatus('pec.lower', [s('BENCH PRESS', 40)], NOW);
    const done = muscleStatus('pec.lower', [s('BENCH PRESS', 100)], NOW);
    expect(just.pct).toBe(0);
    expect(later.pct).toBeGreaterThan(40);
    expect(later.pct).toBeLessThan(70);
    expect(done.pct).toBe(100);
    expect(done.readyAt).toBeNull();
    expect(done.lastAt).toBe(NOW - 100 * H);
  });
  it('secondary movers drain less', () => {
    const tri = muscleStatus('triceps.lat', [s('BENCH PRESS', 0)], NOW);
    expect(tri.pct).toBe(50);
  });
  it('joints list hits but have no battery drain', () => {
    expect(muscleStatus('knee', [s('SQUAT', 1)], NOW).pct).toBe(100);
  });
});

describe('name rules use whole words', () => {
  it('a MACHINE is not a chin-up, NARROW is not a row', () => {
    expect(musclesFor('LEG PRESS MACHINE', ['quads'])['lat']).toBeUndefined();
    expect(musclesFor('NARROW STANCE SQUAT', ['quads'])['traps.mid']).toBeUndefined();
    expect(musclesFor('CHIN UPS', ['lats'])['lat']).toBe(1);
    expect(musclesFor('BARBELL ROW', ['back'])['traps.mid']).toBe(1);
  });
});
