import { describe, it, expect } from 'vitest';
import {
  musclesFor, muscleStatus, byExercise, suggestionsFor, withIntensity, cardioSessions, lastDay, daysSince, type Session,
} from './muscle-recovery';

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
    // Bench press: lateral triceps 0.55 of the work → 3 sets drain 3 × 0.55 / 4.
    const tri = muscleStatus('triceps.lat', [s('BENCH PRESS', 0)], NOW);
    expect(tri.pct).toBe(45);
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

describe('GO list', () => {
  it('names the small movers too', () => {
    expect(musclesFor('CABLE EXTERNAL ROTATION', [])['cuff']).toBe(1);
    expect(musclesFor('SCAPULAR PUSH UP', [])['serratus']).toBe(1);
    expect(musclesFor('HANGING KNEE RAISE', [])['hipflex']).toBe(1);
    expect(musclesFor('BACK EXTENSION', [])['erector']).toBe(1);
    expect(musclesFor('TIBIALIS RAISE', [])['tib']).toBe(1);
  });
  it('groups recent sessions per exercise, newest first', () => {
    const hits = muscleStatus('pec.lower', [s('BENCH PRESS', 100), s('CABLE FLY', 50), s('BENCH PRESS', 10)], NOW).hits;
    const rows = byExercise(hits);
    expect(rows.map(r => [r.session.name, r.times])).toEqual([['BENCH PRESS', 2], ['CABLE FLY', 1]]);
    expect(rows[0].session.at).toBe(NOW - 10 * H);
  });
  it('suggests what you have not done, own exercises among them, best fit first', () => {
    const hits = muscleStatus('pec.lower', [s('BENCH PRESS', 10)], NOW).hits;
    const out = suggestionsFor('pec.lower', hits, [{ name: 'Machine Fly', muscleGroups: ['chest'] }]);
    expect(out.some(x => x.name === 'BENCH PRESS')).toBe(false);
    expect(out.find(x => x.name === 'Machine Fly')).toMatchObject({ share: 1, mine: true });
    expect(out.every((x, i) => i === 0 || out[i - 1].share >= x.share)).toBe(true);
    expect(out.some(x => x.name === 'LEG PRESS')).toBe(false);
  });
});

describe('intensity and cardio', () => {
  it('a lighter day drains less than the heaviest', () => {
    const heavy = { ...s('BENCH PRESS', 0), weightKg: 100, reps: 5 };
    const light = { ...s('BENCH PRESS', 0), exerciseId: 'BENCH PRESS', weightKg: 60, reps: 5 };
    const [h, l] = withIntensity([heavy, light]);
    expect(h.intensity).toBe(1);
    expect(l.intensity).toBeCloseTo(0.6);
    expect(muscleStatus('pec.lower', [l], NOW).pct).toBeGreaterThan(muscleStatus('pec.lower', [h], NOW).pct);
  });

  it('a 5k run takes about half the calves; an ordinary walk nothing', () => {
    const now = new Date(2026, 9, 16, 21).getTime();
    const run = { start: now - 2 * H, end: now - 1.5 * H, distanceM: 5000 };
    const out = cardioSessions({ '2026-10-16': 9000 }, [run, { ...run, start: run.start + 60_000 }], now);
    expect(out.map(x => x.name)).toEqual(['RUN']); // overlapping duplicate dropped; 9k - run steps < free walking
    const calf = muscleStatus('soleus', out, now).pct;
    expect(calf).toBeGreaterThan(40);
    expect(calf).toBeLessThan(65);
    expect(muscleStatus('pec.lower', out, now).pct).toBe(100);
  });

  it('a long walking day costs the calves a little', () => {
    const now = new Date(2026, 9, 16, 21).getTime();
    const out = cardioSessions({ '2026-10-16': 20000 }, [], now);
    expect(out.map(x => x.name)).toEqual(['WALKING']);
    const calf = muscleStatus('soleus', out, now).pct;
    expect(calf).toBeGreaterThan(75);
    expect(calf).toBeLessThan(95);
  });

  it('a walking lunge is still a lunge', () => {
    expect(musclesFor('WALKING LUNGE', ['quads'])['quad.vl']).toBe(1);
    expect(musclesFor('FARMER CARRY', ['forearms'])['soleus']).toBeUndefined();
  });
});

describe('lenses', () => {
  it('last day, its load, and days since', () => {
    const ss = [s('BENCH PRESS', 2), s('SQUAT', 50), { ...s('WALKING', 1), name: 'WALKING' }];
    ss[0].date = '2026-10-16'; ss[1].date = '2026-10-14'; ss[2].date = '2026-10-17';
    const ld = lastDay(ss);
    expect(ld.date).toBe('2026-10-16');
    expect(ld.names).toEqual(['BENCH PRESS']);
    expect(ld.load['pec.lower']).toBe(1);
    const ds = daysSince(ss, NOW);
    expect(ds['pec.lower']).toBeCloseTo(2 / 24);
    expect(ds['quad.vl']).toBeCloseTo(50 / 24);
    expect(ds['soleus']).toBeNull(); // walking doesn't count
  });
});
