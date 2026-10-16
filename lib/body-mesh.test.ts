import { describe, it, expect } from 'vitest';
import { MUSCLES, ZONES, ZONE_OF, decodeBodyMesh } from './body-mesh';
import { baseOf, hasBattery } from './muscle-recovery';

describe('zones', () => {
  it('puts every muscle in exactly one zone', () => {
    const ids = ZONES.flatMap(z => z.muscles);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter(id => !MUSCLES.some(m => m.id === id))).toEqual([]);
    expect(MUSCLES.filter(m => !ZONE_OF[m.id]).map(m => m.id)).toEqual([]);
  });

  it('keeps limbs to one side and the chest across both', () => {
    expect(ZONE_OF['biceps.l']).toBe('arm.l');
    expect(ZONE_OF['biceps.r']).toBe('arm.r');
    expect(ZONE_OF['pec.upper.l']).toBe(ZONE_OF['pec.lower.r']);
  });
});

describe('figure', () => {
  it('only offers muscles you can train, each with a recovery time', () => {
    expect(MUSCLES.filter(m => !hasBattery(baseOf(m.id))).map(m => m.id)).toEqual([]);
  });

  it('decodes the scenery apart from the muscles', () => {
    const mesh = decodeBodyMesh();
    expect(mesh.decor.length).toBeGreaterThan(0);
    expect(mesh.decor.every(p => p.mi === -1)).toBe(true);
    expect(mesh.byMuscle.filter(p => !p)).toEqual([]);
  });
});
