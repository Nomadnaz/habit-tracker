import { describe, expect, it } from 'vitest';
import { mergeRemote } from './syncMerge';

type W = { at: string; amountMl: number; synced?: boolean };
const key = (w: W) => w.at;
const same = (a: W, b: W) => a.amountMl === b.amountMl;

describe('mergeRemote', () => {
  it('adds server-only rows as synced', () => {
    const { merged, changed } = mergeRemote<W>([], [{ at: 't1', amountMl: 250 }], key, same);
    expect(changed).toBe(true);
    expect(merged).toEqual([{ at: 't1', amountMl: 250, synced: true }]);
  });

  it('keeps an unsynced local row the server has not seen yet', () => {
    const { merged, changed } = mergeRemote<W>([{ at: 't1', amountMl: 250 }], [], key, same);
    expect(changed).toBe(false);
    expect(merged).toEqual([{ at: 't1', amountMl: 250 }]);
  });

  it('drops a synced row that disappeared from the server (remote delete)', () => {
    const { merged, changed } = mergeRemote<W>([{ at: 't1', amountMl: 250, synced: true }], [], key, same);
    expect(changed).toBe(true);
    expect(merged).toEqual([]);
  });

  it('does not judge rows outside the pulled window', () => {
    const { merged } = mergeRemote<W>([{ at: 'old', amountMl: 250, synced: true }], [], key, same, (w) => w.at !== 'old');
    expect(merged).toHaveLength(1);
  });

  it('takes the server value for a synced row edited remotely', () => {
    const { merged, changed } = mergeRemote<W>(
      [{ at: 't1', amountMl: 250, synced: true }], [{ at: 't1', amountMl: 500 }], key, same);
    expect(changed).toBe(true);
    expect(merged).toEqual([{ at: 't1', amountMl: 500, synced: true }]);
  });

  it('keeps an unsynced local edit over a stale server value', () => {
    const { merged, changed } = mergeRemote<W>(
      [{ at: 't1', amountMl: 500 }], [{ at: 't1', amountMl: 250 }], key, same);
    expect(changed).toBe(false);
    expect(merged).toEqual([{ at: 't1', amountMl: 500 }]);
  });

  it('marks a matching row synced', () => {
    const { merged, changed } = mergeRemote<W>(
      [{ at: 't1', amountMl: 250 }], [{ at: 't1', amountMl: 250 }], key, same);
    expect(changed).toBe(true);
    expect(merged[0].synced).toBe(true);
  });

  it('reports no change when already in agreement', () => {
    const { changed } = mergeRemote<W>(
      [{ at: 't1', amountMl: 250, synced: true }], [{ at: 't1', amountMl: 250 }], key, same);
    expect(changed).toBe(false);
  });
});
