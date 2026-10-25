import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UNDO_MS, flushRemovals, isPendingRemoval, removeWithUndo, undo } from './undo';

const flush = () => new Promise(r => setImmediate(r));

describe('undo instead of confirm', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
  afterEach(() => { undo(); vi.useRealTimers(); });

  it('hides the thing at once and deletes it only when the toast goes', async () => {
    const commit = vi.fn();
    const after = vi.fn();
    removeWithUndo({ key: 'a', label: 'GONE', commit, after });
    expect(isPendingRemoval('a')).toBe(true);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(commit).toHaveBeenCalledOnce();
    await flush();
    expect(after).toHaveBeenCalledOnce();
    expect(isPendingRemoval('a')).toBe(false);
  });

  it('UNDO cancels the delete and shows it again', () => {
    const commit = vi.fn();
    removeWithUndo({ key: 'b', label: 'GONE', commit });
    undo();
    expect(isPendingRemoval('b')).toBe(false);
    vi.advanceTimersByTime(UNDO_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it('a second delete lands the first straight away', async () => {
    const first = vi.fn();
    const second = vi.fn();
    removeWithUndo({ key: 'c', label: 'ONE', commit: first });
    removeWithUndo({ key: 'd', label: 'TWO', commit: second });
    expect(first).toHaveBeenCalledOnce();
    await flush();
    expect(isPendingRemoval('c')).toBe(false);
    expect(isPendingRemoval('d')).toBe(true);
    // UNDO now only brings back the second.
    undo();
    vi.advanceTimersByTime(UNDO_MS);
    expect(second).not.toHaveBeenCalled();
  });

  it('flushing (the app going to the background) lands it now', () => {
    const commit = vi.fn();
    removeWithUndo({ key: 'e', label: 'GONE', commit });
    flushRemovals();
    expect(commit).toHaveBeenCalledOnce();
  });

  it('a failed delete shows the thing again', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    removeWithUndo({ key: 'f', label: 'GONE', commit: () => { throw new Error('disk full'); } });
    flushRemovals();
    await flush();
    expect(isPendingRemoval('f')).toBe(false);
    warn.mockRestore();
  });
});
