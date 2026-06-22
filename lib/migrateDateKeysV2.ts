// One-time migration: rewrites every AsyncStorage date key from the old
// "YYYY-M-D" (0-indexed month) format to the canonical zero-padded
// "YYYY-MM-DD" format (lib/dateKey.ts). Runs once on app boot, guarded by a
// flag — see tasks/004 and tasks/003 for the full plan and inventory.
//
// No dual-format support is kept after this runs: there are no production
// users yet, so a one-time rewrite is simpler than a permanent parser that
// understands both formats forever.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { toDateKey } from './dateKey';

const MIGRATION_FLAG = '@dateKeyMigrationV2Done';

/** Parses the OLD "YYYY-M-D" (0-indexed month) key format. Only used here. */
function oldKeyToDate(key: string): Date | null {
  const parts = key.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => Number.isNaN(n))) return null;
  const [year, month, day] = parts;
  const d = new Date(year, month, day, 0, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

function migrateDateKeyedRecord<T>(record: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [oldKey, value] of Object.entries(record)) {
    const d = oldKeyToDate(oldKey);
    out[d ? toDateKey(d) : oldKey] = value; // leave unparseable keys untouched
  }
  return out;
}

async function migrateTasks(): Promise<void> {
  const raw = await AsyncStorage.getItem('@tasks');
  if (!raw) return;
  const taskMap = JSON.parse(raw) as Record<string, unknown>;
  await AsyncStorage.setItem('@tasks', JSON.stringify(migrateDateKeyedRecord(taskMap)));
}

async function migrateBody(): Promise<void> {
  const raw = await AsyncStorage.getItem('@body');
  if (!raw) return;
  const body = JSON.parse(raw) as Record<string, unknown>;
  if (body.stepsHistory) body.stepsHistory = migrateDateKeyedRecord(body.stepsHistory as Record<string, unknown>);
  if (body.trainingHistory) body.trainingHistory = migrateDateKeyedRecord(body.trainingHistory as Record<string, unknown>);
  await AsyncStorage.setItem('@body', JSON.stringify(body));
}

async function migrateDateField(storageKey: string): Promise<void> {
  const raw = await AsyncStorage.getItem(storageKey);
  if (!raw) return;
  const entries = JSON.parse(raw) as Array<Record<string, unknown>>;
  const migrated = entries.map((entry) => {
    if (typeof entry.date !== 'string') return entry;
    const d = oldKeyToDate(entry.date);
    return d ? { ...entry, date: toDateKey(d) } : entry;
  });
  await AsyncStorage.setItem(storageKey, JSON.stringify(migrated));
}

export async function migrateDateKeysV2(): Promise<void> {
  const done = await AsyncStorage.getItem(MIGRATION_FLAG);
  if (done) return;

  await Promise.all([
    migrateTasks(),
    migrateBody(),
    migrateDateField('@wk_done'), // DoneEntry[].date
    migrateDateField('@wk_pbs'),  // PBEntry[].date
  ]);

  await AsyncStorage.setItem(MIGRATION_FLAG, 'true');
}
