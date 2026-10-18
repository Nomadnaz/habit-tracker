// Apple Health (HealthKit) — read steps, walking distance, activity, sleep, weight, heart rate, HRV.
// Requires a custom iOS dev build (not Expo Go). Run: npx expo prebuild && npx expo run:ios

import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { dateKey, type BodyData, type HeartNow } from './body-data';
import type { Run } from './muscle-recovery';
import type { Vitals } from './coach';
import { buildVitals, type Sample, type Seen, type SleepSample } from './vitals';
import { getWearable, wearableById } from './wearables';

export type AppleHealthActivityToday = {
  activeMinutes: number;
  caloriesKcal: number;
  distanceM: number;
  flightsClimbed: number;
};

export type AppleHealthSyncResult = {
  dailySteps: Record<string, number>;
  hourlySteps: Record<string, number>;   // 'YYYY-MM-DDTHH' → steps — STEPS' weekly climb times
  activityToday: AppleHealthActivityToday;
  sleepMins: number | null;
  weightKg: number | null;
  weightAt: string | null;
  heart: HeartNow;
  runs: Run[];             // running workouts, last 14 days
  vitals: Vitals;          // daily HRV / resting HR / sleep / breathing, 35 days — the coach's inputs
};

type HealthSample = { value: number; startDate: string; endDate: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HealthKitModule = any;

function getHealthKit(): HealthKitModule | null {
  if (Platform.OS !== 'ios') return null;
  try {
    // Native module only exists in custom dev / production builds.
    // react-native-health exports via `module.exports =`, not a `.default` —
    // reading `.default` here always returned undefined, silently disabling
    // HealthKit in every build, dev or production.
    return require('react-native-health') as HealthKitModule;
  } catch {
    return null;
  }
}

// `vitals` adds what only a wearable writes. Asked for from Settings' CONNECT
// WEARABLE, not on every auto-sync, so a launch never pops a Health sheet;
// once granted, iOS remembers and reads work either way.
function getPermissions(kit: HealthKitModule, vitals = false) {
  const { Permissions } = kit.Constants;
  return {
    permissions: {
      read: [
        ...(vitals ? [Permissions.RestingHeartRate, Permissions.RespiratoryRate, Permissions.OxygenSaturation] : []),
        Permissions.Steps,
        Permissions.DistanceWalkingRunning,
        Permissions.ActiveEnergyBurned,
        Permissions.FlightsClimbed,
        Permissions.AppleExerciseTime,
        Permissions.SleepAnalysis,
        Permissions.Weight,
        Permissions.Height,
        Permissions.HeartRate,
        Permissions.HeartRateVariability,
        Permissions.Workout,
      ],
      write: [
        Permissions.Weight,
      ],
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

export async function initAppleHealth(vitals = false): Promise<boolean> {
  const kit = getHealthKit();
  if (!kit) return false;

  if (typeof kit.isAvailable !== 'function') {
    throw new Error('HealthKit native module loaded but isAvailable() is missing — check native linking.');
  }
  const available = await promisifyNoOpts<boolean>((cb) => kit.isAvailable(cb));
  if (!available) return false;

  await new Promise<void>((resolve, reject) => {
    kit.initHealthKit(getPermissions(kit, vitals), (err: string) => {
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

// HealthKit hands these back in hourly buckets (period defaults to 60 min):
// summed per day for the totals, kept per hour for the weekly climb.
async function fetchDailySteps(kit: HealthKitModule, days: number): Promise<{ daily: Record<string, number>; hourly: Record<string, number> }> {
  const end = new Date();
  const start = addDays(startOfToday(), -(days - 1));
  const samples = await promisify<HealthSample[]>(
    kit.getDailyStepCountSamples.bind(kit),
    { startDate: start.toISOString(), endDate: end.toISOString(), period: 60 },
  ).catch(() => [] as HealthSample[]);
  const hourly: Record<string, number> = {};
  for (const s of samples) {
    const d = new Date(s.startDate);
    const k = `${dateKey(d)}T${String(d.getHours()).padStart(2, '0')}`;
    hourly[k] = (hourly[k] ?? 0) + Math.round(s.value);
  }
  return { daily: aggregateSamplesByDay(samples), hourly };
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

async function fetchLatestWeightKg(kit: HealthKitModule): Promise<{ kg: number; at: string } | null> {
  type WeightResult = { value: number; endDate: string };
  const unit = kit.Constants?.Units?.gram ?? 'gram';
  const latest = await promisify<WeightResult>(
    kit.getLatestWeight.bind(kit),
    { unit },
  ).catch(() => null);
  if (!latest?.value) return null;
  // Library returns grams when unit is gram.
  const kg = latest.value >= 1000 ? latest.value / 1000 : latest.value;
  return { kg: Math.round(kg * 10) / 10, at: latest.endDate };
}

async function fetchHeart(kit: HealthKitModule): Promise<HeartNow> {
  const now = Date.now();
  const range = (days: number, limit?: number) => ({
    startDate: new Date(now - days * 86_400_000).toISOString(), endDate: new Date(now).toISOString(), ascending: false, ...(limit ? { limit } : {}),
  });
  const [latest, day, hrv] = await Promise.all([
    promisify<HealthSample[]>(kit.getHeartRateSamples.bind(kit), range(7, 1)).catch(() => [] as HealthSample[]),
    promisify<HealthSample[]>(kit.getHeartRateSamples.bind(kit), range(1)).catch(() => [] as HealthSample[]),
    promisify<HealthSample[]>(kit.getHeartRateVariabilitySamples.bind(kit), range(30)).catch(() => [] as HealthSample[]),
  ]);
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  const week = now - 7 * 86_400_000;
  // Newest first. HRV comes back in seconds. An older newest reading still
  // shows, with its age, rather than a blank.
  return {
    bpm: latest.length ? Math.round(latest[0].value) : null,
    bpmAt: latest[0]?.endDate ?? null,
    avgBpm: mean(day.map(x => x.value)),
    hrvMs: hrv.length ? Math.round(hrv[0].value * 1000) : null,
    hrvAt: hrv[0]?.endDate ?? null,
    hrvAvgMs: mean(hrv.filter(x => Date.parse(x.endDate) >= week).map(x => x.value * 1000)),
  };
}

export type HeartProbe = { at: string; source: string } | null;

/** The newest heart-rate and HRV sample Health will give this app, ever. None
 *  at all while a watch is worn means read access is off — iOS shows an app
 *  with no access an empty store rather than an error. */
export async function probeHeart(): Promise<{ hr: HeartProbe; hrv: HeartProbe }> {
  const kit = getHealthKit();
  if (!kit) return { hr: null, hrv: null };
  const ever = { startDate: new Date(2014, 0, 1).toISOString(), endDate: new Date().toISOString(), ascending: false, limit: 1 };
  type S = HealthSample & { sourceName?: string };
  const one = (fn: string) => promisify<S[]>(kit[fn].bind(kit), ever)
    .then(xs => (xs[0] ? { at: xs[0].endDate, source: xs[0].sourceName ?? 'a device' } : null))
    .catch(() => null);
  const [hr, hrv] = await Promise.all([one('getHeartRateSamples'), one('getHeartRateVariabilitySamples')]);
  return { hr, hrv };
}

/** Running workouts (any app or watch) — the BODY tab counts their steps as leg training. */
async function fetchRuns(kit: HealthKitModule, days: number): Promise<Run[]> {
  type W = { activityName: string; distance: number; start: string; end: string };
  const res = await promisify<{ data: W[] }>(kit.getAnchoredWorkouts.bind(kit), {
    startDate: addDays(startOfToday(), -days).toISOString(), endDate: new Date().toISOString(),
  }).catch(() => ({ data: [] as W[] }));
  return (res?.data ?? [])
    .filter(w => /running/i.test(w.activityName) && w.distance > 0)
    .map(w => ({ start: Date.parse(w.start), end: Date.parse(w.end), distanceM: Math.round(w.distance * 1609.344) }));
}

/** 35 days of the coach's recovery numbers, from the connected wearable where it wrote them. */
async function fetchVitals(kit: HealthKitModule, days = 35): Promise<{ vitals: Vitals; seen: Seen }> {
  const range = { startDate: addDays(startOfToday(), -days).toISOString(), endDate: new Date().toISOString() };
  const get = <T,>(fn: string) => (typeof kit[fn] === 'function'
    ? promisify<T[]>(kit[fn].bind(kit), range).catch(() => [] as T[])
    : Promise.resolve([] as T[]));
  const [hrv, rhr, resp, spo2, sleep, link] = await Promise.all([
    get<Sample>('getHeartRateVariabilitySamples'),
    get<Sample>('getRestingHeartRateSamples'),
    get<Sample>('getRespiratoryRateSamples'),
    get<Sample>('getOxygenSaturationSamples'),
    get<SleepSample>('getSleepSamples'),
    getWearable(),
  ]);
  return buildVitals({ hrv, rhr, resp, spo2, sleep, prefer: wearableById(link?.id)?.source ?? null });
}

/** CONNECT WEARABLE's check: ask for the wearable permissions, then report who wrote what. */
export async function checkWearableData(): Promise<{ ok: boolean; seen: Seen; error?: string }> {
  const kit = getHealthKit();
  if (!kit) return { ok: false, seen: [], error: 'Apple Health needs the iPhone app (not the web or Expo Go).' };
  try {
    if (!(await initAppleHealth(true))) return { ok: false, seen: [], error: 'Apple Health is not available on this device.' };
    const { seen } = await fetchVitals(kit);
    void connectAndSyncAppleHealth(56);
    return { ok: true, seen };
  } catch (e) {
    return { ok: false, seen: [], error: e instanceof Error ? e.message : 'Could not read Apple Health.' };
  }
}

/** Heart-rate samples between two times, oldest first ([] without Health or a watch). */
export async function heartRateBetween(start: number, end: number): Promise<{ at: number; bpm: number }[]> {
  const kit = getHealthKit();
  if (!kit) return [];
  try {
    if (!(await initAppleHealth())) return [];
    const xs = await promisify<HealthSample[]>(kit.getHeartRateSamples.bind(kit), {
      startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(), ascending: true,
    });
    return xs.map(x => ({ at: Date.parse(x.startDate), bpm: Math.round(x.value) }));
  } catch { return []; }
}

export async function fetchAppleHealthMetrics(historyDays = 56): Promise<AppleHealthSyncResult | null> {
  const kit = getHealthKit();
  if (!kit) return null;

  const [{ daily: dailySteps, hourly: hourlySteps }, activityToday, sleepMins, weight, heart, runs, { vitals }] = await Promise.all([
    fetchDailySteps(kit, historyDays),
    fetchTodayActivity(kit),
    fetchLastNightSleepMins(kit),
    fetchLatestWeightKg(kit),
    fetchHeart(kit),
    fetchRuns(kit, 14),
    fetchVitals(kit),
  ]);

  // Last night from the wearable's sleep stages beats the longest raw segment.
  const staged = vitals.sleep[dateKey(startOfToday())]?.asleep ?? null;
  return { dailySteps, hourlySteps, activityToday, sleepMins: staged ?? sleepMins, weightKg: weight?.kg ?? null, weightAt: weight?.at ?? null, heart, runs, vitals };
}

/** Writes a manually-logged weight into HealthKit so it shows up in the Health app too. */
export async function saveWeightToAppleHealth(weightKg: number, at: string): Promise<boolean> {
  if (!isAppleHealthSupported()) return false;
  try {
    const granted = await initAppleHealth();
    if (!granted) return false;
    const kit = getHealthKit();
    if (!kit) return false;
    const unit = kit.Constants?.Units?.gram ?? 'gram';
    await promisify<unknown>(kit.saveWeight.bind(kit), { value: weightKg * 1000, unit, date: at });
    return true;
  } catch {
    return false;
  }
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
  // Hourly steps: merge, keep the last ~9 weeks.
  const cutoff = dateKey(addDays(startOfToday(), -63));
  const stepsHourly = Object.fromEntries(Object.entries({ ...(data.stepsHourly ?? {}), ...sync.hourlySteps }).filter(([k]) => k >= cutoff));
  const next: BodyData = {
    ...data,
    stepsHistory,
    stepsHourly,
    stepsThisYear: stepsThisYearFromHistory(stepsHistory),
    activityToday: sync.activityToday,
    heart: sync.heart,
    runs: sync.runs,
    vitals: sync.vitals,
    appleHealthConnected: true,
    appleHealthLastSync: new Date().toISOString(),
  };
  if (sync.sleepMins != null) next.sleepMins = sync.sleepMins;
  if (sync.weightKg != null && sync.weightKg > 0 && sync.weightAt) {
    const logs = [...data.weightLogs];
    const sampleAt = new Date(sync.weightAt).getTime();
    // Dedupe on the sample's OWN recorded time (not "now") -- else the same
    // HealthKit reading gets re-inserted with a fresh timestamp on every tab
    // focus, perpetually outranking a genuinely newer manual log.
    const alreadyLogged = logs.some(l => Math.abs(new Date(l.at).getTime() - sampleAt) < 1000);
    if (!alreadyLogged) {
      logs.push({ weightKg: sync.weightKg, at: sync.weightAt });
      logs.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
      next.weightLogs = logs;
    }
  }
  return next;
}

/** Request HealthKit access and pull latest metrics into BodyData. `vitals`
 *  also asks for what only a watch or ring writes (resting HR and friends). */
export async function connectAndSyncAppleHealth(historyDays = 56, vitals = false): Promise<{
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
    const granted = await initAppleHealth(vitals);
    if (!granted) {
      return { ok: false, error: 'Apple Health is not available on this device.' };
    }
    const metrics = await fetchAppleHealthMetrics(historyDays);
    if (!metrics) {
      return { ok: false, error: 'Could not read Apple Health data.' };
    }
    const { applyHealthSync, syncTodayStepsToSupabase, todaySteps } = await import('./body-data');
    const merged = await applyHealthSync(metrics);
    syncTodayStepsToSupabase(todaySteps(merged));
    return { ok: true, data: merged };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Apple Health sync failed.';
    return { ok: false, error: message };
  }
}

const AUTO_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000; // 15 min -- avoid a HealthKit round trip on every glance at the app

/**
 * Keeps today's steps/activity fresh without the user having to remember to
 * hit a manual sync button. Companion HUD's HUB screen reads steps_today
 * from device-state, which reads it from Supabase's daily_steps table,
 * which previously only ever got a row when connectAndSyncAppleHealth() was
 * called from the onboarding connect screen or a manual gym-tab sync --
 * meaning it went stale the moment the user stopped tapping that button
 * (confirmed on 2026-09-04: the newest row was over a month old). This re-
 * syncs automatically on launch and every foreground, but only if the user
 * has already connected Health at least once -- it never triggers the
 * permission prompt itself. historyDays=2 keeps each auto-sync cheap (only
 * today + yesterday need refreshing); the deep 56-day pull stays a manual,
 * explicit action. Mirrors lib/ble-bridge.ts's useBleAutoConnect. */
export function useAppleHealthAutoSync(): void {
  const lastSyncRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function trySync() {
      if (!isAppleHealthSupported()) return;
      if (Date.now() - lastSyncRef.current < AUTO_SYNC_MIN_INTERVAL_MS) return;
      const { loadBodyData } = await import('./body-data');
      const data = await loadBodyData();
      if (cancelled || !data.appleHealthConnected) return;
      lastSyncRef.current = Date.now();
      await connectAndSyncAppleHealth(2);
    }

    void trySync();
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') void trySync();
    });
    return () => { cancelled = true; sub.remove(); };
  }, []);
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
