// Canonical date-key helpers — the ONLY place this app generates or parses a
// date key. Format: zero-padded ISO YYYY-MM-DD, 1-indexed months, local
// timezone (system-model.md). Used for AsyncStorage keys and Supabase `date`
// columns alike.

export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateKey(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  const [year, month, day] = parts; // month is 1-indexed in the key
  const d = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

/**
 * Shift a date key by `delta` calendar days (negative to go back), entirely
 * in local time via Date's setDate — never via millisecond arithmetic on a
 * `new Date(key)` parse. That parse reads the key as UTC midnight while
 * toDateKey formats in local time, so `new Date(new Date(key).getTime() -
 * 86400000)` silently steps TWO local calendar days in any negative-offset
 * timezone (all of the Americas) — an audit (2026-07-06) found this had
 * corrupted every habit/challenge streak calculation for those users.
 * setDate is also DST-safe, unlike subtracting a fixed 86400000ms.
 */
export function addDaysToKey(key: string, delta: number): string {
  const d = fromDateKey(key);
  if (!d) throw new Error(`addDaysToKey: invalid date key "${key}"`);
  d.setDate(d.getDate() + delta);
  return toDateKey(d);
}

/**
 * Whole calendar days from `fromKey` to `toKey` (both local midnight via
 * fromDateKey — never `new Date(key)`, which reads UTC midnight and can be
 * off by a day depending on the caller's timezone offset relative to the
 * key's local date).
 */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const a = fromDateKey(fromKey);
  const b = fromDateKey(toKey);
  if (!a || !b) throw new Error(`daysBetweenKeys: invalid date key ("${fromKey}", "${toKey}")`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
