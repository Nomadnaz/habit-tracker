// ─────────────────────────────────────────────────────────────────────────
// SLEEP — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Same local-first pattern as lib/habits-data.ts / lib/meals-data.ts: nightly
// logs + the Phone Down Challenge live in AsyncStorage for instant/offline
// reads, mutations fire-and-forget to Supabase and run postWrite(). iOS Sleep
// Focus auto-detection is device-gated (Screen Time / Shortcuts — task 042
// territory); logPhoneDown() is the manual-entry fallback the task explicitly
// asks the app to ship with.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey, addDaysToKey } from './dateKey';
import { postWrite } from './postWrite';
import { withStorageLock } from './storageLock';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const SLEEP_KEY        = '@sleep_logs';       // Record<dateKey, SleepLog>
const PHONE_KEY        = '@sleep_phone_logs'; // Record<dateKey, PhoneLog>
const TARGET_KEY        = '@phone_down_target'; // 'HH:MM'
const DEFAULT_TARGET   = '22:30';

export type SleepLog = {
  id: string;
  date: string; // canonical YYYY-MM-DD, the wake-up day
  bedtime?: string;   // 'HH:MM'
  wakeTime?: string;  // 'HH:MM'
  totalHours?: number;
  qualityScore?: number; // 1-5
  notes?: string;
  createdAt: string;
};

export type ChallengeResult = 'pass' | 'close' | 'fail';

export type PhoneLog = {
  id: string;
  date: string;
  phoneDownTime: string; // 'HH:MM'
  challengeResult: ChallengeResult;
  createdAt: string;
};

// ── Time helpers ──────────────────────────────────────────────────────────────

function parseHM(hm: string): number { // minutes since midnight
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

/** Hours between bedtime and wake_time, assuming an overnight sleep. */
export function computeTotalHours(bedtime: string, wakeTime: string): number {
  const b = parseHM(bedtime);
  const w = parseHM(wakeTime);
  const minutes = w > b ? w - b : 24 * 60 - b + w;
  return Math.round((minutes / 60) * 10) / 10;
}

// ── Sleep logs: load / mutate ────────────────────────────────────────────────

type SleepMap = Record<string, SleepLog>;

async function loadSleepMap(): Promise<SleepMap> {
  try {
    const raw = await AsyncStorage.getItem(SLEEP_KEY);
    if (raw) return JSON.parse(raw) as SleepMap;
  } catch { /* fall through */ }
  return {};
}

async function saveSleepMap(map: SleepMap): Promise<void> {
  await AsyncStorage.setItem(SLEEP_KEY, JSON.stringify(map));
}

export async function getRecentSleepLogs(days = 7): Promise<SleepLog[]> {
  const map = await loadSleepMap();
  const today = toDateKey(new Date());
  const logs: SleepLog[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(today, -i);
    if (map[key]) logs.push(map[key]);
  }
  return logs.reverse(); // oldest first, for a chart
}

export async function getSleepLog(dateKey: string): Promise<SleepLog | null> {
  const map = await loadSleepMap();
  return map[dateKey] ?? null;
}

export async function logSleep(input: {
  date: string; bedtime?: string; wakeTime?: string; qualityScore?: number; notes?: string;
}): Promise<SleepLog> {
  const totalHours = input.bedtime && input.wakeTime ? computeTotalHours(input.bedtime, input.wakeTime) : undefined;
  const log: SleepLog = {
    id: genId(), date: input.date, bedtime: input.bedtime, wakeTime: input.wakeTime,
    totalHours, qualityScore: input.qualityScore, notes: input.notes,
    createdAt: new Date().toISOString(),
  };
  await withStorageLock(SLEEP_KEY, async () => {
    const map = await loadSleepMap();
    map[input.date] = log;
    await saveSleepMap(map);
  });

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('sleep_logs').upsert(
      {
        id: log.id, user_id: userId, date: log.date, bedtime: log.bedtime ?? null,
        wake_time: log.wakeTime ?? null, total_hours: log.totalHours ?? null,
        quality_score: log.qualityScore ?? null, notes: log.notes ?? null, source_device: 'manual',
      },
      { onConflict: 'user_id,date' },
    );
  });
  // wakeTime feeds postWrite's badge check (the hidden 'early_bird' badge, task 063).
  postWrite('sleep', { date: log.date, totalHours: log.totalHours, qualityScore: log.qualityScore, wakeTime: log.wakeTime }, 'create');

  return log;
}

// ── Phone Down Challenge ──────────────────────────────────────────────────────

export async function getPhoneDownTarget(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(TARGET_KEY);
    if (raw) return raw;
  } catch { /* fall through */ }
  return DEFAULT_TARGET;
}

export async function setPhoneDownTarget(hm: string): Promise<void> {
  await withStorageLock(TARGET_KEY, () => AsyncStorage.setItem(TARGET_KEY, hm));
}

type PhoneMap = Record<string, PhoneLog>;

async function loadPhoneMap(): Promise<PhoneMap> {
  try {
    const raw = await AsyncStorage.getItem(PHONE_KEY);
    if (raw) return JSON.parse(raw) as PhoneMap;
  } catch { /* fall through */ }
  return {};
}

async function savePhoneMap(map: PhoneMap): Promise<void> {
  await AsyncStorage.setItem(PHONE_KEY, JSON.stringify(map));
}

/** Pass: at/before target. Close: within 15 min after target. Fail: later, or never logged. */
export function scoreChallenge(phoneDownTime: string, target: string): ChallengeResult {
  const diff = parseHM(phoneDownTime) - parseHM(target);
  if (diff <= 0) return 'pass';
  if (diff <= 15) return 'close';
  return 'fail';
}

export async function getRecentPhoneLogs(days = 7): Promise<PhoneLog[]> {
  const map = await loadPhoneMap();
  const today = toDateKey(new Date());
  const logs: PhoneLog[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(today, -i);
    if (map[key]) logs.push(map[key]);
  }
  return logs.reverse();
}

/**
 * Streak of consecutive 'pass' days — separate from lib/habits-data.ts's habit
 * streaks. An audit (2026-07-06) found the day-decrement here used to parse
 * `cursor` (a date key) with `new Date(cursor)` — UTC midnight — then format
 * back with toDateKey (local), silently stepping TWO local calendar days in
 * any negative-offset timezone. Fixed via addDaysToKey, which never leaves
 * local time. See lib/dateKey.ts's addDaysToKey doc comment for the full story.
 */
export function computeChallengeStreak(logs: PhoneLog[]): number {
  const passDates = new Set(logs.filter(l => l.challengeResult === 'pass').map(l => l.date));
  const today = toDateKey(new Date());
  const yesterday = addDaysToKey(today, -1);
  let cursor = passDates.has(today) ? today : passDates.has(yesterday) ? yesterday : null;
  if (!cursor) return 0;
  let streak = 0;
  while (passDates.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

export async function logPhoneDown(dateKey: string, phoneDownTime: string): Promise<PhoneLog> {
  const target = await getPhoneDownTarget();
  const challengeResult = scoreChallenge(phoneDownTime, target);
  const log: PhoneLog = { id: genId(), date: dateKey, phoneDownTime, challengeResult, createdAt: new Date().toISOString() };

  const map = await withStorageLock(PHONE_KEY, async () => {
    const map = await loadPhoneMap();
    map[dateKey] = log;
    await savePhoneMap(map);
    return map;
  });

  const streak = computeChallengeStreak(Object.values(map));

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('sleep_phone_logs').upsert(
      {
        id: log.id, user_id: userId, date: dateKey, phone_down_time: phoneDownTime,
        challenge_result: challengeResult, streak_count: streak, sleep_focus_activated: false,
      },
      { onConflict: 'user_id,date' },
    );
  });

  // challengeStreak feeds postWrite's badge check ('phone_free_week', task 063).
  postWrite('sleep', { date: dateKey, challengeStreak: streak }, 'create');

  return log;
}
