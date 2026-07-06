// ─────────────────────────────────────────────────────────────────────────
// CYCLE TRACKING — LOCAL DATA LAYER (task 067), opt-in only
// ─────────────────────────────────────────────────────────────────────────
// Hidden by default: isOptedIn() must return true before any screen shows
// this domain's content. Deliberately NEVER referenced by buildContext or
// any companion's contextSources — see supabase/functions/_shared/
// companions.ts, which has no 'cycle' entry and no 'cycle_logs' source
// anywhere in buildContext.ts. The Face ID gate this task also asks for is
// NOT implemented (no expo-local-authentication dependency installed, no
// device to verify a biometric flow — see tasks/067 notes for why that's
// the honest call here, same reasoning as journal/therapy encryption).
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey, addDaysToKey } from './dateKey';
import { withStorageLock } from './storageLock';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const OPT_IN_KEY = '@cycle_opted_in';
const SETTINGS_KEY = '@cycle_settings';
const LOGS_KEY = '@cycle_logs';

export type CycleSettings = {
  averageCycleLength: number; averagePeriodLength: number;
  lastPeriodStart?: string; tryingToConceive: boolean;
};
export type CycleLogType = 'period' | 'symptom' | 'note';
export type CycleLog = { id: string; date: string; type: CycleLogType; flowIntensity?: string; symptoms: string[]; notes?: string };

const DEFAULT_SETTINGS: CycleSettings = { averageCycleLength: 28, averagePeriodLength: 5, tryingToConceive: false };

export async function isOptedIn(): Promise<boolean> {
  return (await AsyncStorage.getItem(OPT_IN_KEY)) === 'true';
}

export async function setOptedIn(value: boolean): Promise<void> {
  await withStorageLock(OPT_IN_KEY, () => AsyncStorage.setItem(OPT_IN_KEY, value ? 'true' : 'false'));
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('cycle_settings').upsert({ user_id: userId, opted_in: value });
  });
}

export async function getSettings(): Promise<CycleSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return DEFAULT_SETTINGS;
}

export async function saveSettings(settings: CycleSettings): Promise<void> {
  await withStorageLock(SETTINGS_KEY, () => AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)));
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('cycle_settings').upsert({
      user_id: userId, average_cycle_length: settings.averageCycleLength,
      average_period_length: settings.averagePeriodLength,
      last_period_start: settings.lastPeriodStart ?? null,
      trying_to_conceive: settings.tryingToConceive,
    });
  });
}

export async function getRecentLogs(days = 90): Promise<CycleLog[]> {
  try {
    const raw = await AsyncStorage.getItem(LOGS_KEY);
    const all: CycleLog[] = raw ? JSON.parse(raw) : [];
    const cutoff = addDaysToKey(toDateKey(new Date()), -days);
    return all.filter(l => l.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date));
  } catch {
    return [];
  }
}

export async function addLog(input: { date: string; type: CycleLogType; flowIntensity?: string; symptoms?: string[]; notes?: string }): Promise<CycleLog> {
  const log: CycleLog = { id: genId(), symptoms: [], ...input };
  await withStorageLock(LOGS_KEY, async () => {
    const raw = await AsyncStorage.getItem(LOGS_KEY);
    const all: CycleLog[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.setItem(LOGS_KEY, JSON.stringify([...all, log]));
  });

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('cycle_logs').insert({
      id: log.id, user_id: userId, date: log.date, type: log.type,
      flow_intensity: log.flowIntensity ?? null, symptoms: log.symptoms, notes: log.notes ?? null,
    });
    if (log.type === 'period') {
      const settings = await getSettings();
      if (!settings.lastPeriodStart || log.date > settings.lastPeriodStart) {
        await saveSettings({ ...settings, lastPeriodStart: log.date });
      }
    }
  });
  // Deliberately no postWrite() call — cycle data must never enter the
  // shared cumulative_stats/badges/context-summary fan-out either.
  return log;
}

/**
 * Was parsing lastPeriodStart with `new Date(key)` (UTC midnight) then
 * calling setDate on it (which mutates based on the LOCAL representation of
 * that instant) — predicted the next period one day early for
 * negative-offset timezones. Fixed via addDaysToKey (audit 2026-07-06, M3).
 */
export function predictNextPeriod(settings: CycleSettings): string | null {
  if (!settings.lastPeriodStart) return null;
  return addDaysToKey(settings.lastPeriodStart, settings.averageCycleLength);
}
