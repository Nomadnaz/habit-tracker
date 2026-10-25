// One save at a time for a button that creates something: a second tap
// while the first is still writing does nothing, so a double tap can't make
// two records, and `busy` disables the button so it looks it. (The other
// half of idempotency is already the data layer's: each record's id is made
// once on the client before it's written, and that same id goes to
// Supabase, so writing the same record again can't create a second row.)
import { useCallback, useRef, useState } from 'react';

export function useInFlight(): [boolean, <T>(fn: () => Promise<T>) => Promise<T | undefined>] {
  const [busy, setBusy] = useState(false);
  const on = useRef(false);
  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (on.current) return undefined;
    on.current = true;
    setBusy(true);
    try {
      return await fn();
    } finally {
      on.current = false;
      setBusy(false);
    }
  }, []);
  return [busy, run];
}
