// ─────────────────────────────────────────────────────────────────────────
// storageLock.ts — per-key serialization for AsyncStorage read-modify-write.
// ─────────────────────────────────────────────────────────────────────────
// Every lib/*-data.ts domain follows the same pattern: load a blob, mutate a
// copy, save it back. Two overlapping calls against the SAME key (e.g.
// toggling two different habits, which both read/write the shared
// '@habit_logs' blob) each read the same snapshot — the second setItem
// silently discards the first mutation. An audit (2026-07-06) found this
// race present in every domain data layer with no guard (lib/task-sync-lock.ts
// already had this exact fix for '@tasks' alone — this generalizes it to any
// key, keyed independently so unrelated domains never block each other).
//
// Usage: wrap the whole load→mutate→save body for a given key:
//   return withStorageLock(HABITS_KEY, async () => { ...existing logic... });
// Concurrent calls with the SAME key run strictly one-at-a-time, in call
// order. Calls with different keys run fully in parallel, unaffected.
// ─────────────────────────────────────────────────────────────────────────

const chains = new Map<string, Promise<unknown>>();

export function withStorageLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  // Swallow the result/error for chaining purposes only — the real result/
  // error still propagates to the caller via `run`, returned below.
  chains.set(key, run.then(() => undefined, () => undefined));
  return run;
}
