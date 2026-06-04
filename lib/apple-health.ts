// Apple Health (HealthKit) — read steps, walking distance, activity, sleep, weight.
// Requires a custom iOS dev build (not Expo Go). Run: npx expo prebuild && npx expo run:ios

import { Platform } from 'react-native';
import { dateKey, type BodyData } from './body-data';

export type AppleHealthActivityToday = {
  activeMinutes: number;
  caloriesKcal: number;
  distanceM: number;
  flightsClimbed: number;
};

export type AppleHealthSyncResult = {
  dailySteps: Record<string, number>;
  activityToday: AppleHealthActivityToday;
  sleepMins: number | null;
  weightKg: number | null;
};

type HealthSample = { value: number; startDate: string; endDate: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HealthKitModule = any;

function getHealthKit(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Native module only exists in custom dev / production builds.
    return require('react-native-health').default as HealthKitModule;
  } catch {
    return null;
  }
}

function getPermissions(kit: HealthKitModule) {
  const { Permissions } = kit.Constants;
  return {
    permissions: {
      read: [
        Permissions.Steps,
        Permissions.DistanceWalkingRunning,
        Permissions.ActiveEnergyBurned,
        Permissions.FlightsClimbed,
        Permissions.AppleExerciseTime,
        Permissions.SleepAnalysis,
        Permissions.Weight,
        Permissions.Height,
      ],
      write: [],
    },
  };
}

function promisify<T>(
  fn: (options: Record<string, unknown>, cb: (err: string, result: T) => void) => void,
  options: Record<string, unknown>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn(options, (err: string, result: T) => {
      if (err) reject(new Error(err));
      else resolve(result);
    });
  });
}

function promisifyNoOpts<T>(
  fn: (cb: (err: string, result: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    fn((err: string, result: T) => {
      if (err) reject(new Error(err));
      else resolve(result);
    });
  });
}

export function isAppleHealthSupported(): boolean {
  return Platform.OS === 'ios' && getHealthKit() != null;
}

export async function initAppleHealth(): Promise<boolean> {
  const kit = getHealthKit();
  if (!kit) return false;

  const available = await promisifyNoOpts<boolean>((cb) => kit.isAvailable(cb)).catch(() => false);
  if (!available) return false;

  await new Promise<void>((resolve, reject) => {
    kit.initHealthKit(getPermissions(kit), (err: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });
  return true;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + delta);
  return d;
}

function aggregateSamplesByDay(samples: HealthSample[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of samples) {
    const key = dateKey(new Date(s.endDate));
    out[key] = (out[key] ?? 0) + Math.round(s.value);
  }
  return out;
}

function sumSamplesToday(samples: HealthSample[]): number {
  const today = dateKey(startOfToday());
  return samples
    .filter(s => dateKey(new Date(s.endDate)) === today)
    .reduce((sum, s) => sum + s.value, 0);
}

async function fetchDailySteps(kit: HealthKitModule, days: number): Promise<Record<string, number>> {
  const end = new Date();
  const start = addDays(startOfToday(), -(days - 1));
  const samples = await promisify<HealthSample[]>(
    kit.getDailyStepCountSamples.bind(kit),
    { startDate: start.toISOString(), endDate: end.toISOString() },
  ).catch(() => [] as HealthSample[]);
  return aggregateSamplesByDay(samples);
}

async function fetchTodayActivity(kit: HealthKitModule): Promise<AppleHealthActivityToday> {
  const start = startOfToday().toISOString();
  const end = new Date().toISOString();
  const range = { startDate: start, endDate: end };

  const [energy, distance, flights, exercise] = await Promise.all([
    promisify<HealthSample[]>(kit.getActiveEnergyBurned.bind(kit), range).catch(() => []),
    promisify<HealthSample[]>(kit.getDailyDistanceWalkingRunningSamples.bind(kit), range).catch(() => []),
    promisify<HealthSample[]>(kit.getDailyFlightsClimbedSamples.bind(kit), range).catch(() => []),
    promisify<HealthSample[]>(kit.getAppleExerciseTime.bind(kit), range).catch(() => []),
  ]);

  const caloriesKcal = Math.round(sumSamplesToday(energy));
  const distanceM = Math.round(sumSamplesToday(distance));
  const flightsClimbed = Math.round(sumSamplesToday(flights));
  // Apple Exercise Time is in minutes.
  const activeMinutes = Math.round(sumSamplesToday(exercise));

  return { activeMinutes, caloriesKcal, distanceM, flightsClimbed };
}

async function fetchLastNightSleepMins(kit: HealthKitModule): Promise<number | null> {
  const start = addDays(startOfToday(), -2).toISOString();
  const end = new Date().toISOString();
  type SleepSample = { startDate: string; endDate: string; value: string };
  const samples = await promisify<SleepSample[]>(
    kit.getSleepSamples.bind(kit),
    { startDate: start, endDate: end },
  ).catch(() => [] as SleepSample[]);

  if (samples.length === 0) return null;

  // Use the longest in-bed / asleep segment ending today or yesterday night.
  const today = startOfToday();
  let bestMins = 0;
  for (const s of samples) {
    const endDt = new Date(s.endDate);
    if (endDt < addDays(today, -1)) continue;
    const mins = Math.round((endDt.getTime() - new Date(s.startDate).getTime()) / 60_000);
    if (mins > bestMins) bestMins = mins;
  }
  return bestMins > 0 ? bestMins : null;
}

async function fetchLatestWeightKg(kit: HealthKitModule): Promise<number | null> {
  type WeightResult = { value: number };
  const unit = kit.Constants?.Units?.gram ?? 'gram';
  const latest = await promisify<WeightResult>(
    kit.getLatestWeight.bind(kit),
    { unit },
  ).catch(() => null);
  if (!latest?.value) return null;
  // Library returns grams when unit is gram.
  const kg = latest.value >= 1000 ? latest.value / 1000 : latest.value;
  return Math.round(kg * 10) / 10;
}

export async function fetchAppleHealthMetrics(historyDays = 56): Promise<AppleHealthSyncResult | null> {
  const kit = getHealthKit();
  if (!kit) return null;

  const [dailySteps, activityToday, sleepMins, weightKg] = await Promise.all([
    fetchDailySteps(kit, historyDays),
    fetchTodayActivity(kit),
    fetchLastNightSleepMins(kit),
    fetchLatestWeightKg(kit),
  ]);

  return { dailySteps, activityToday, sleepMins, weightKg };
}

export function stepsThisYearFromHistory(stepsHistory: Record<string, number>): number {
  const year = new Date().getFullYear();
  return Object.entries(stepsHistory).reduce((sum, [key, count]) => {
    const y = parseInt(key.split('-')[0], 10);
    return y === year ? sum + count : sum;
  }, 0);
}

export function mergeAppleHealthIntoBodyData(
  data: BodyData,
  sync: AppleHealthSyncResult,
): BodyData {
  const stepsHistory = { ...data.stepsHistory, ...sync.dailySteps };
  const next: BodyData = {
    ...data,
    stepsHistory,
    stepsThisYear: stepsThisYearFromHistory(stepsHistory),
    activityToday: sync.activityToday,
    appleHealthConnected: true,
    appleHealthLastSync: new Date().toISOString(),
  };
  if (sync.sleepMins != null) next.sleepMins = sync.sleepMins;
  if (sync.weightKg != null && sync.weightKg > 0) {
    const logs = [...data.weightLogs];
    const last = logs[logs.length - 1];
    const differs = !last || Math.abs(last.weightKg - sync.weightKg) > 0.05;
    if (differs) {
      logs.push({ weightKg: sync.weightKg, at: new Date().toISOString() });
      next.weightLogs = logs;
    }
  }
  return next;
}

/** Request HealthKit access and pull latest metrics into BodyData. */
export async function connectAndSyncAppleHealth(historyDays = 56): Promise<{
  ok: boolean;
  data?: BodyData;
  error?: string;
}> {
  if (!isAppleHealthSupported()) {
    return {
      ok: false,
      error: 'Apple Health needs an iOS development build. Rebuild with: npx expo run:ios',
    };
  }
  try {
    const granted = await initAppleHealth();
    if (!granted) {
      return { ok: false, error: 'Apple Health is not available on this device.' };
    }
    const metrics = await fetchAppleHealthMetrics(historyDays);
    if (!metrics) {
      return { ok: false, error: 'Could not read Apple Health data.' };
    }
    const { loadBodyData, saveBodyData } = await import('./body-data');
    const current = await loadBodyData();
    const merged = mergeAppleHealthIntoBodyData(current, metrics);
    await saveBodyData(merged);
    return { ok: true, data: merged };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Apple Health sync failed.';
    return { ok: false, error: message };
  }
}

export function formatActiveTimeHrs(mins: number): string {
  if (mins <= 0) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Approximate elevation from flights climbed (~3 m per flight). */
export function elevationMFromFlights(flights: number): number {
  return Math.round(flights * 3);
}
