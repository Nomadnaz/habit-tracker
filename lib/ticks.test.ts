import { describe, expect, it } from 'vitest';
import { flipDay } from './ticks';

type Log = { id: string; date: string; completed: boolean };
const fresh = () => ({ id: 'new', date: '2026-10-25', completed: true });

describe('flipDay', () => {
  it('adds a ticked log when the day has none', () => {
    const r = flipDay<Log, 'completed'>([{ id: 'a', date: '2026-10-24', completed: true }], '2026-10-25', 'completed', fresh);
    expect(r.existed).toBe(false);
    expect(r.record).toEqual(fresh());
    expect(r.logs).toHaveLength(2);
  });

  it("toggles the day's own log both ways, leaving the others", () => {
    const logs: Log[] = [{ id: 'a', date: '2026-10-24', completed: true }, { id: 'b', date: '2026-10-25', completed: true }];
    const off = flipDay(logs, '2026-10-25', 'completed', fresh);
    expect(off.existed).toBe(true);
    expect(off.logs).toEqual([logs[0], { id: 'b', date: '2026-10-25', completed: false }]);
    const on = flipDay(off.logs, '2026-10-25', 'completed', fresh);
    expect(on.logs[1].completed).toBe(true);
    expect(logs[1].completed).toBe(true); // never mutates
  });
});
