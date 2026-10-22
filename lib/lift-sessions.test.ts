import { describe, it, expect, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
import { parseReps, RepAssembler, placeSet, sessionStats, type LiftSet } from './lift-sessions';

const set = (at: string, weightKg = 60, reps = 3, repData: LiftSet['repData'] = null): LiftSet =>
  ({ at, setMs: 9000, weightKg, reps, romCm: 40, peakMps: 0.9, tempoS: 1.2, repData });

describe('rep chunks', () => {
  it('parses and skips junk', () => {
    expect(parseReps('34.1,0.82,0.61,1210;x;33,0.7,0.5,1300')).toEqual([
      { romCm: 34.1, peakMps: 0.82, meanMps: 0.61, durMs: 1210 },
      { romCm: 33, peakMps: 0.7, meanMps: 0.5, durMs: 1300 },
    ]);
  });

  it('joins chunks by set id, numbering each rep, and keeps what arrived', () => {
    const a = new RepAssembler();
    a.add({ set: 7, i: 5, n: 6, ms: 9000, r: '30,0.6,0.4,1500' });
    a.add({ set: 7, i: 0, n: 6, r: '40,1,0.8,1000;39,0.9,0.7,1100;38,0.8,0.6,1200;37,0.7,0.5,1300;36,0.7,0.5,1400' });
    const got = a.take(7);
    expect(got.ms).toBe(9000);
    expect(got.reps?.map(r => r.romCm)).toEqual([40, 39, 38, 37, 36, 30]);
    expect(got.reps?.map(r => r.n)).toEqual([1, 2, 3, 4, 5, 6]);
    // A lost chunk leaves a gap, not an empty chart.
    a.add({ set: 8, i: 3, n: 6, r: '37,0.7,0.5,1300;36,0.7,0.5,1400;30,0.6,0.4,1500' });
    expect(a.take(8).reps?.map(r => r.n)).toEqual([4, 5, 6]);
    a.add({ set: 9, i: 0, n: 2, r: 'nan,nan,0,0' });
    expect(a.take(9).reps).toBeNull();
    expect(a.take(99)).toEqual({ reps: null, ms: null });
  });
});

describe('sessions', () => {
  let n = 0;
  const id = () => `s${++n}`;
  it('groups sets of one exercise within the gap, splits after it', () => {
    let r = placeSet([], set('2026-10-16T10:00:00Z'), 'bench press', 'e1', '2026-10-16', id);
    r = placeSet(r.sessions, set('2026-10-16T10:04:00Z', 70), 'BENCH PRESS', null, '2026-10-16', id);
    expect(r.sessions).toHaveLength(1);
    expect(r.session.sets).toHaveLength(2);
    expect(r.session.exerciseId).toBe('e1');
    r = placeSet(r.sessions, set('2026-10-16T11:00:00Z'), 'BENCH PRESS', 'e1', '2026-10-16', id);
    expect(r.sessions).toHaveLength(2);
    r = placeSet(r.sessions, set('2026-10-16T11:01:00Z'), 'SQUAT', 'e2', '2026-10-16', id);
    expect(r.sessions).toHaveLength(3);
  });

  it('totals a session', () => {
    const reps = [1, 0.9, 0.75].map((p, i) => ({ romCm: 40 - i, peakMps: p, meanMps: p / 2, durMs: 1000 }));
    const st = sessionStats({ id: 'x', exerciseId: null, name: 'BENCH', date: 'd', sets: [set('a', 60, 5), set('b', 70, 3, reps)] });
    expect(st.volumeKg).toBe(510);
    expect(st.topKg).toBe(70);
    expect(st.est1RmKg).toBe(77);
    expect(st.tutS).toBe(3);
    expect(st.velocityLossPct).toBe(25);
    expect(st.bestRomCm).toBe(40); // set 1 has no reps (40), set 2's best rep is 40
    expect(st.peakMps).toBe(1);
  });
});
