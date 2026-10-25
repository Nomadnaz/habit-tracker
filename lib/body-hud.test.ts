import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));

import { decodeBodyMesh, raycastHit } from './body-mesh';
import {
  ALL_MODULES, DEFAULT_PINS, HOME_SPOT, SLOTS, freeSlots, move, offBody, place, remove, repoint, sanitize, swapModule,
  type Pin,
} from './body-hud';

const slots = (pins: Pin[]) => Object.fromEntries(pins.map(p => [p.id, p.slot]));
const spot = { at: [1, 2, 3] as [number, number, number], n: [0, 0, 1] as [number, number, number] };

describe('body hud layout', () => {
  it('starts with ten modules in ten different slots', () => {
    expect(DEFAULT_PINS).toHaveLength(SLOTS);
    expect(new Set(DEFAULT_PINS.map(p => p.slot)).size).toBe(SLOTS);
    expect(freeSlots(DEFAULT_PINS)).toEqual([]);
    expect(offBody(DEFAULT_PINS)).toEqual(['goal', 'log', 'weight', 'active', 'mood']);
  });

  it('a new module takes the slot and knocks the old one off', () => {
    const next = place(DEFAULT_PINS, 'mood', 5, spot);
    expect(next.find(p => p.slot === 5)).toMatchObject({ id: 'mood', at: spot.at });
    expect(next.some(p => p.id === 'sleep')).toBe(false);
    expect(next).toHaveLength(SLOTS);
  });

  it('moving onto a taken slot swaps the two', () => {
    const next = move(DEFAULT_PINS, 'readiness', 9);
    expect(slots(next)).toMatchObject({ readiness: 9, week: 0 });
    // Lines stay where they were.
    expect(next.find(p => p.id === 'week')!.at).toEqual(HOME_SPOT.week.at);
  });

  it('placing a module already on the figure moves it rather than duplicating it', () => {
    const one = remove(DEFAULT_PINS, 'week');
    const next = place(one, 'steps', 9, spot);
    expect(next.filter(p => p.id === 'steps')).toHaveLength(1);
    expect(slots(next).steps).toBe(9);
    expect(freeSlots(next)).toEqual([4]);
  });

  it('repoints a line and swaps a slot’s module in place', () => {
    const r = repoint(DEFAULT_PINS, 'heart', spot);
    expect(r.find(p => p.id === 'heart')!.at).toEqual(spot.at);
    const s = swapModule(r, 'heart', 'mood');
    expect(s.find(p => p.slot === 6)).toMatchObject({ id: 'mood', at: spot.at });
    // Swapping in one that's already on the figure trades their places.
    const t = swapModule(DEFAULT_PINS, 'heart', 'fuel');
    expect(slots(t)).toMatchObject({ fuel: 6, heart: 1 });
  });

  it('sanitize drops junk, unknown modules and duplicates', () => {
    expect(sanitize('nope')).toBeNull();
    const got = sanitize([
      { id: 'steps', slot: 0, at: [0, 0, 0], n: null },
      { id: 'steps', slot: 1, at: [0, 0, 0], n: null },
      { id: 'water', slot: 0, at: [0, 0, 0], n: null },
      { id: 'pizza', slot: 2, at: [0, 0, 0], n: null },
      { id: 'fuel', slot: 12, at: [0, 0, 0], n: null },
      { id: 'sleep', slot: 3, at: [0, 'x', 0], n: null },
      { id: 'heart', slot: 4, at: [1, 2, 3], n: [0, 0, 1] },
    ]);
    expect(got).toEqual([{ id: 'steps', slot: 0, at: [0, 0, 0], n: null }, { id: 'heart', slot: 4, at: [1, 2, 3], n: [0, 0, 1] }]);
  });

  it('every home spot sits on the figure’s surface', () => {
    const mesh = decodeBodyMesh();
    for (const id of ALL_MODULES) {
      const [x, y, z] = HOME_SPOT[id].at;
      const hit = raycastHit(mesh, [x, y, 300], [0, 0, -1]);
      expect(hit, id).not.toBeNull();
      expect(Math.abs(hit!.at[2] - z), id).toBeLessThan(1);
    }
  });
});
