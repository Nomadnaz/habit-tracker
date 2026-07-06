/** Serializes @tasks read-modify-write paths (remote reconcile + Apple pull). */
let chain: Promise<void> = Promise.resolve();

export function withTaskSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
