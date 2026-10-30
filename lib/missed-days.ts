// Missed days: days you didn't open the app or log anything, marked as such
// from TRAIN's calendar. A missed day isn't "0 kcal, 0 ml" — the twin treats
// it as an ordinary day, filling its food and water with your average over
// the days you did log (fillMissed, used by lib/twin-data.ts), so a blank day
// doesn't read as a fast and set tomorrow's targets off.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { withStorageLock } from './storageLock';

const KEY = '@missed_days';

export async function getMissedDays(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : [];
  } catch {
    return [];
  }
}

/** Marks (or unmarks) one day, a date key, as missed. */
export async function setMissed(date: string, missed: boolean): Promise<void> {
  await withStorageLock(KEY, async () => {
    const days = new Set(await getMissedDays());
    if (missed) days.add(date); else days.delete(date);
    await AsyncStorage.setItem(KEY, JSON.stringify([...days].sort()));
  });
}

/** Per-day values with each missed day that has none filled in as the average
 *  of the days that do. Days that were logged keep what was logged. */
export function fillMissed(byDay: Record<string, number>, missed: string[]): Record<string, number> {
  const logged = Object.values(byDay).filter(v => v > 0);
  if (!logged.length) return byDay;
  const avg = Math.round(logged.reduce((a, v) => a + v, 0) / logged.length);
  const out = { ...byDay };
  for (const d of missed) if (!(out[d] > 0)) out[d] = avg;
  return out;
}
