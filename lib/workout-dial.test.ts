import { describe, expect, it } from 'vitest';
import { dialOrder } from './workout-dial';
import type { Today } from './coach';
import type { WorkoutTemplate } from './workout-data';

// Monday 19 Oct 2026, 9am.
const now = new Date(2026, 9, 19, 9);
const today = (over: Partial<Today> = {}): Today => ({
  focus: 'push', title: 'PUSH DAY', scheduled: true, done: false, when: 'TODAY', at: now.getTime(),
  planned: 'push', swapped: false, fresh: 100, freshBy: { push: 96, pull: 80 }, readyBy: {},
  readiness: { score: 80, level: 'train', factors: [], flags: [] }, setDelta: 0, reasons: [], ...over,
} as Today);
const tpl = (id: string, name: string, isArchived = false): WorkoutTemplate => ({ id, name, colour: '#FFF', isArchived });

describe('dialOrder', () => {
  it('puts the pick first, then the rotation on its training days, then the rest, then your own days', () => {
    const items = dialOrder({
      today: today(),
      routine: { days: ['monday', 'wednesday', 'friday', 'saturday', 'sunday', 'tuesday'], split: 'ppl' },
      templates: [tpl('t1', 'PUSH DAY'), tpl('t2', 'ARMS'), tpl('t3', 'OLD', true)],
      liftsOf: id => (id === 't1' ? 4 : 2),
      now,
    });
    expect(items.map(i => i.key)).toEqual([
      'focus:push', 'focus:pull', 'focus:legs',
      'focus:upper', 'focus:lower', 'focus:full', 'focus:core',
      't:t2',
    ]);
    expect(items[0]).toMatchObject({ next: true, when: 'TODAY', ready: 96, lifts: 4, title: 'PUSH DAY' });
    expect(items[1]).toMatchObject({ next: false, when: 'TOMORROW', ready: 80, lifts: 5 });
    expect(items[2].when).toBe('WED');
    expect(items[3].when).toBeNull();
    expect(items[7]).toMatchObject({ title: 'ARMS', sel: { templateId: 't2' }, ready: null, lifts: 2 });
  });

  it('starts the rotation after the pick and marks a finished day DONE', () => {
    const items = dialOrder({
      today: today({ focus: 'legs', done: true }),
      routine: { days: ['monday', 'wednesday', 'friday', 'saturday', 'sunday', 'tuesday'], split: 'ppl' },
      templates: [], liftsOf: () => 0, now,
    });
    expect(items.slice(0, 3).map(i => i.key)).toEqual(['focus:legs', 'focus:push', 'focus:pull']);
    expect(items[0].when).toBe('DONE');
  });

  it('without a routine lists every focus once after the pick', () => {
    const items = dialOrder({ today: today({ focus: 'core' }), routine: null, templates: [], liftsOf: () => 0, now });
    expect(items[0].key).toBe('focus:core');
    expect(new Set(items.map(i => i.key)).size).toBe(7);
  });
});
