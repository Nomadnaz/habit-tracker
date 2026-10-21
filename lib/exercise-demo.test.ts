import { describe, expect, it } from 'vitest';
import { demoFor, pulleyPin, solve } from './exercise-demo';
import { LIBRARY } from './exercise-library';

type P = [number, number];
const cross = (o: P, a: P, b: P) => (a[0] - o[0]) * (b[1] - a[1]) - (a[1] - o[1]) * (b[0] - a[0]);

// Side views face +x. Whatever the body's angle, a knee only folds so the shin
// swings to the BACK of the thigh (clockwise from it), an elbow only so the
// forearm swings to the FRONT of the upper arm (anticlockwise). A nearly
// straight joint is fine either way.
// Pressing and wide pulls turn the upper arm out (bench, pulldown, inverted
// row, the hands on a hip-thrust bar), so their elbows fold out of the side
// view's plane and may draw either way; their knees are still checked.
const ARM_TURNED = new Set(['bench', 'pulldown', 'invrow', 'thrust']);

describe('exercise demos bend joints the way bodies bend', () => {
  const seen = new Set<string>();
  for (const ex of LIBRARY) {
    const d = demoFor(ex.pattern, ex.name);
    const key = JSON.stringify(d);
    if (seen.has(key) || d.view !== 'side') continue;
    seen.add(key);
    it(`${ex.name} (${ex.pattern})`, () => {
      const bad: string[] = [];
      for (let f = 0; f <= 10; f++) {
        const j = solve(d, f / 10);
        const tol = (o: P, a: P, b: P) => 0.12 * Math.hypot(a[0] - o[0], a[1] - o[1]) * Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (cross(j.hip, j.knee, j.ankle) > tol(j.hip, j.knee, j.ankle)) bad.push(`near knee @${f / 10}`);
        if (cross(j.hip2, j.knee2, j.ankle2) > tol(j.hip2, j.knee2, j.ankle2)) bad.push(`far knee @${f / 10}`);
        if (ARM_TURNED.has(ex.pattern)) continue;
        if (cross(j.shoulder, j.elbow, j.hand) < -tol(j.shoulder, j.elbow, j.hand)) bad.push(`near elbow @${f / 10}`);
        if (cross(j.shoulder2, j.elbow2, j.hand2) < -tol(j.shoulder2, j.elbow2, j.hand2)) bad.push(`far elbow @${f / 10}`);
      }
      expect([...new Set(bad.map(b => b.split(' @')[0]))]).toEqual([]);
    });
  }
});

describe('cable demos', () => {
  it('put the pulley at the library height', () => {
    const d = demoFor('pushdown', 'TRICEP PUSHDOWN', 1);
    expect(d.anchor![1]).toBeGreaterThan(190);
    expect(demoFor('curl', 'CABLE CURL', 0.05).anchor![1]).toBeLessThan(20);
    expect(demoFor('curl', 'BAYESIAN CURL', 0.05).anchor![0]).toBeLessThan(0); // behind you
  });
});

describe('pulleyPin', () => {
  it('counts pins up from the floor', () => {
    expect(pulleyPin(0)).toEqual({ pin: 1, of: 20, zone: 'BOTTOM' });
    expect(pulleyPin(1)).toEqual({ pin: 20, of: 20, zone: 'TOP' });
    expect(pulleyPin(0.8).zone).toBe('HEAD HEIGHT');
    expect(pulleyPin(0.6).zone).toBe('CHEST HEIGHT');
  });
});
