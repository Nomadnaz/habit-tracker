// ─────────────────────────────────────────────────────────────────────────
// Undo instead of "Are you sure?" (the Gmail pattern). A delete hides the
// thing straight away and puts up an UNDO toast (components/UndoToast.tsx).
// The real delete runs when the toast goes: after UNDO_MS, when another
// delete replaces it, or when the app goes to the background. So UNDO only
// has to cancel it, and nothing ever needs restoring, locally or in
// Supabase. Screens hide whatever is waiting with usePendingRemovals().
// ─────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from 'react';

export const UNDO_MS = 7000;

export type Removal = {
  /** The id screens hide while it waits. */
  key: string;
  /** What the toast says, e.g. 'MEAL DELETED'. */
  label: string;
  /** The real delete. */
  commit: () => unknown;
  /** Once it has landed, e.g. re-read the list. The thing stays hidden until this resolves. */
  after?: () => unknown;
};
export type ShownRemoval = Removal & { t0: number };

let shown: ShownRemoval | null = null;
let pending: ReadonlySet<string> = new Set();
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const without = (s: ReadonlySet<string>, k: string) => {
  const n = new Set(s);
  n.delete(k);
  return n;
};
const stopTimer = () => {
  if (timer) clearTimeout(timer);
  timer = null;
};

/** Hide `r.key` now and offer UNDO; the delete itself runs when the toast goes. */
export function removeWithUndo(r: Removal) {
  if (shown) void land(shown); // a second delete lands the first
  const mine: ShownRemoval = { ...r, t0: Date.now() };
  shown = mine;
  pending = new Set(pending).add(r.key);
  stopTimer();
  timer = setTimeout(() => { if (shown === mine) void land(mine); }, UNDO_MS);
  emit();
}

async function land(r: ShownRemoval) {
  if (shown === r) { shown = null; stopTimer(); }
  emit();
  try {
    await r.commit();
    await r.after?.();
  } catch (e) {
    // Nothing was deleted, so letting it show again is the truth.
    console.warn('[undo] delete failed', e);
  } finally {
    pending = without(pending, r.key);
    emit();
  }
}

export function undo() {
  const r = shown;
  if (!r) return;
  shown = null;
  stopTimer();
  pending = without(pending, r.key);
  emit();
}

/** Land whatever is waiting, now. */
export function flushRemovals() {
  if (shown) void land(shown);
}

export const isPendingRemoval = (key: string) => pending.has(key);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
export const useUndoToast = () => useSyncExternalStore(subscribe, () => shown);
export const usePendingRemovals = () => useSyncExternalStore(subscribe, () => pending);
