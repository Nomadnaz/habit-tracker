// ─────────────────────────────────────────────────────────────────────────
// BODY PAGE — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for everything shown on the BODY screen. Local-first
// (AsyncStorage), same pattern as the rest of the app.
//
// An audit (2026-07-07) found this file's first-launch seedData() fabricated
// steps/training history, headline lifts, a "weakest muscle," a strength
// trend, sleep, and protein — and PERSISTED it, making fake data
// indistinguishable from real after first launch. All of that is gone.
// Every field below is either read from real user data (water/weight logs,
// workout-data.ts's exercises/PB log/done log/gym plan, lib/sleep-data.ts,
// lib/meals-data.ts) or an honest empty/`null` state when no real data
// exists yet. Nothing here is fabricated.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { postWrite } from './postWrite';
import { withStorageLock } from './storageLock';
import { toDateKey as dateKey, addDaysToKey } from './dateKey';
export { dateKey };
import {
  getExercises, getPBLog, getDoneLog, getGymPlan, getTemplateExercises,
  type GymPlan,
} from './workout-data';
import { computeStreak } from './habits-data';
import { getRecentSleepLogs } from './sleep-data';
import { getMealsForDate, dailyTotals, getTargets } from './meals-data';
import {
  stepsThisYearFromHistory, trainingDayTypeFor, computeHeadlineLiftsFromData,
  computeStrengthTrendFromLifts, computeLeastTrainedMuscleFromData, computeMuscleGroupTalliesFromData,
  computeNextSessionFromPlan, goalStatus as goalStatusPure, formatSleep as formatSleepPure,
  type DayType, type HeadlineLift, type LeastTrainedMuscle, type StrengthTrend, type NextSession,
  type MuscleGroupTally,
} from './bodyFormulas';
export {
  stepsThisYearFromHistory, trainingDayTypeFor, computeHeadlineLiftsFromData,
  computeStrengthTrendFromLifts, computeLeastTrainedMuscleFromData, computeNextSessionFromPlan,
  type DayType, type HeadlineLift, type LeastTrainedMuscle, type StrengthTrend, type NextSession,
  type MuscleGroupTally,
};

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const BODY_KEY = '@body';

// ── Types ────────────────────────────────────────────────────────────────

export type SquareState = 'hit' | 'partial' | 'missed' | 'empty';
export type Movement = 'push' | 'pull' | 'legs' | 'upper' | 'lower';

export type WeightLog = { weightKg: number; at: string };
export type WaterLog = { amountMl: number; at: string };

export type BodyActivityToday = {
  activeMinutes: number;
  caloriesKcal: number;
  distanceM: number;
  flightsClimbed: number;
};

export type BodyData = {
  // 1.1 Global stats bar
  workoutsTotal: number;
  stepsThisYear: number;
  streak: number;

  // 1.2 Steps
  stepsGoal: number;
  stepsHistory: Record<string, number>; // dateKey → step count

  // 1.3 Training
  nextSession: NextSession | null;
  trainingHistory: Record<string, DayType>;
  activeMovement: Movement;

  // 1.5 Strength (real headline lifts — omitted if the user hasn't created that exercise yet)
  headlineLifts: HeadlineLift[];

  // Body metrics row
  weightLogs: WeightLog[];
  leastTrainedMuscle: LeastTrainedMuscle | null;
  strengthTrend: StrengthTrend | null;

  // 1.10 Recovery
  sleepMins: number | null;
  waterLogs: WaterLog[];
  waterGoalMl: number;
  proteinTodayG: number;
  proteinGoalG: number;

  // Apple Health (optional — filled after user connects on BODY tab)
  appleHealthConnected?: boolean;
  appleHealthLastSync?: string;
  activityToday?: BodyActivityToday;
};

// ── Date helpers ───────────────────────────────────────────────────────────

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

// ── I/O wrappers (fetch real data, then call the pure functions in bodyFormulas.ts) ─────

async function computeTrainingHistory(days = 42): Promise<Record<string, DayType>> {
  const [doneLog, gymPlan] = await Promise.all([getDoneLog(), getGymPlan()]);
  const doneDates = new Set(doneLog.map(e => e.date));
  const today = startOfToday();
  const out: Record<string, DayType> = {};
  for (let i = 0; i < days; i++) {
    const d = addDays(today, -i);
    out[dateKey(d)] = trainingDayTypeFor(d, doneDates, gymPlan);
  }
  return out;
}

async function computeHeadlineLifts(): Promise<HeadlineLift[]> {
  const [exercises, pbLog] = await Promise.all([getExercises(), getPBLog()]);
  return computeHeadlineLiftsFromData(exercises, pbLog, dateKey(new Date()));
}

async function fetchRecentTemplateExercises(): Promise<{ recentTemplateExercises: { muscleGroups: import('./workout-data').MuscleGroup[] }[][]; allExercises: { muscleGroups: import('./workout-data').MuscleGroup[] }[] }> {
  const cutoff = addDaysToKey(dateKey(new Date()), -28);
  const [doneLog, allExercises] = await Promise.all([getDoneLog(), getExercises()]);
  const recent = doneLog.filter(e => e.date >= cutoff);
  const recentTemplateExercises = await Promise.all(recent.map(e => getTemplateExercises(e.templateId)));
  return { recentTemplateExercises, allExercises };
}

async function computeLeastTrainedMuscle(): Promise<LeastTrainedMuscle | null> {
  const { recentTemplateExercises, allExercises } = await fetchRecentTemplateExercises();
  return computeLeastTrainedMuscleFromData(recentTemplateExercises, allExercises);
}

/** Full per-muscle-group trailing-28-day breakdown for the strength detail page. */
export async function getMuscleGroupBreakdown(): Promise<MuscleGroupTally[]> {
  const { recentTemplateExercises, allExercises } = await fetchRecentTemplateExercises();
  return computeMuscleGroupTalliesFromData(recentTemplateExercises, allExercises);
}

async function computeNextSession(): Promise<NextSession | null> {
  const gymPlan = await getGymPlan();
  return computeNextSessionFromPlan(gymPlan, addDays(startOfToday(), 1));
}

async function computeSleepMins(): Promise<number | null> {
  const logs = await getRecentSleepLogs(7);
  const last = logs[logs.length - 1];
  return last?.totalHours ? Math.round(last.totalHours * 60) : null;
}

async function computeProteinToday(): Promise<{ today: number; goal: number }> {
  const [meals, targets] = await Promise.all([getMealsForDate(dateKey(new Date())), getTargets()]);
  return { today: Math.round(dailyTotals(meals).proteinG), goal: targets.proteinG };
}

async function computeGymStreak(): Promise<number> {
  const doneLog = await getDoneLog();
  const uniqueDates = [...new Set(doneLog.map(e => e.date))];
  return computeStreak(uniqueDates.map(date => ({ date, completed: true }))).current;
}

// ── Core (persisted) state — real empty defaults, no seed ──────────────────

type CoreBodyData = Pick<
  BodyData,
  | 'stepsGoal' | 'stepsHistory' | 'activeMovement' | 'weightLogs' | 'waterLogs'
  | 'waterGoalMl' | 'workoutsTotal' | 'appleHealthConnected' | 'appleHealthLastSync'
  | 'activityToday' | 'sleepMins'
>;

// stepsGoal/waterGoalMl are user-configurable GOALS (sane defaults), not
// fabricated history — everything else here is a genuine empty state.
const EMPTY_CORE: CoreBodyData = {
  stepsGoal: 10000,
  stepsHistory: {},
  activeMovement: 'pull',
  weightLogs: [],
  waterLogs: [],
  waterGoalMl: 3000,
  workoutsTotal: 0,
  appleHealthConnected: false,
  appleHealthLastSync: undefined,
  activityToday: undefined,
  sleepMins: null,
};

async function loadCore(): Promise<CoreBodyData> {
  try {
    const raw = await AsyncStorage.getItem(BODY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        stepsGoal: parsed.stepsGoal ?? EMPTY_CORE.stepsGoal,
        stepsHistory: parsed.stepsHistory ?? {},
        activeMovement: parsed.activeMovement ?? 'pull',
        weightLogs: parsed.weightLogs ?? [],
        waterLogs: parsed.waterLogs ?? [],
        waterGoalMl: parsed.waterGoalMl ?? 3000,
        workoutsTotal: parsed.workoutsTotal ?? 0,
        appleHealthConnected: parsed.appleHealthConnected ?? false,
        appleHealthLastSync: parsed.appleHealthLastSync,
        activityToday: parsed.activityToday,
        sleepMins: parsed.sleepMins ?? null,
      };
    }
  } catch { /* fall through */ }
  return EMPTY_CORE;
}

// ── Load / save ─────────────────────────────────────────────────────────────

export async function loadBodyData(): Promise<BodyData> {
  const core = await loadCore();
  const [trainingHistory, headlineLifts, leastTrainedMuscle, nextSession, sleepFromLog, protein, streak] =
    await Promise.all([
      computeTrainingHistory(),
      computeHeadlineLifts(),
      computeLeastTrainedMuscle(),
      computeNextSession(),
      computeSleepMins(),
      computeProteinToday(),
      computeGymStreak(),
    ]);
  const strengthTrend = computeStrengthTrendFromLifts(headlineLifts);

  return {
    ...core,
    stepsThisYear: stepsThisYearFromHistory(core.stepsHistory),
    streak,
    nextSession,
    trainingHistory,
    headlineLifts,
    leastTrainedMuscle,
    strengthTrend,
    // Prefer the explicit sleep-domain log; fall back to whatever Apple
    // Health last synced onto the core blob; else honest null.
    sleepMins: sleepFromLog ?? core.sleepMins,
    proteinTodayG: protein.today,
    proteinGoalG: protein.goal,
  };
}

async function save(data: BodyData): Promise<void> {
  await AsyncStorage.setItem(BODY_KEY, JSON.stringify(data));
}

export async function saveBodyData(data: BodyData): Promise<void> {
  await save(data);
}

/** Sync from Apple Health when already connected (no permission dialog). */
export async function refreshAppleHealthIfConnected(): Promise<BodyData | null> {
  const data = await loadBodyData();
  if (!data.appleHealthConnected) return null;
  const { fetchAppleHealthMetrics, mergeAppleHealthIntoBodyData, initAppleHealth } = await import('./apple-health');
  const granted = await initAppleHealth();
  if (!granted) return null;
  const metrics = await fetchAppleHealthMetrics(56);
  if (!metrics) return null;
  const merged = mergeAppleHealthIntoBodyData(data, metrics);
  await save(merged);
  return merged;
}

// ── Down-sync ────────────────────────────────────────────────────────────────
// This layer is local-first and was push-only, so water/weight logged by the
// voice device (which writes server-side) never reached the app. Same gap and
// same fix as lib/meals-data.ts -- see the long note there for the merge
// reasoning. `tasks` is the only table with realtime, so every domain needs
// its own pull.
//
// Water and weight are the awkward case: locally they are bare
// {amountMl|weightKg, at} entries with NO id -- the row id is generated at
// insert time and thrown away. So these dedupe on the TIMESTAMP instead, via
// epoch-ms so that '...T12:00:00.000Z' and '...T12:00:00+00:00' compare equal
// rather than double-logging every remote drink.
const epoch = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -1 : t;
};

/**
 * Pulls server-side water and weight entries into local storage. Never throws
 * (offline is normal); returns true only if something actually changed.
 * `days` bounds the query -- the device can only have written recently, and an
 * unbounded pull would grow forever.
 */
export async function pullRemoteBody(days = 14): Promise<boolean> {
  try {
    const userId = await getUid();
    if (!userId) return false;
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const [waterQ, weightQ] = await Promise.all([
      supabase.from('water_logs').select('amount_ml, logged_at')
        .eq('user_id', userId).gte('logged_at', since),
      supabase.from('body_weight_logs').select('weight_kg, logged_at')
        .eq('user_id', userId).gte('logged_at', since),
    ]);
    if (waterQ.error || weightQ.error) return false;

    return await withStorageLock(BODY_KEY, async () => {
      const data = await loadBodyData();
      let changed = false;

      const haveWater = new Set((data.waterLogs ?? []).map((w) => epoch(w.at)));
      for (const r of waterQ.data ?? []) {
        const at = String(r.logged_at);
        if (haveWater.has(epoch(at))) continue;
        data.waterLogs.push({ amountMl: Number(r.amount_ml ?? 0), at });
        haveWater.add(epoch(at));
        changed = true;
      }

      const haveWeight = new Set((data.weightLogs ?? []).map((w) => epoch(w.at)));
      for (const r of weightQ.data ?? []) {
        const at = String(r.logged_at);
        if (haveWeight.has(epoch(at))) continue;
        data.weightLogs.push({ weightKg: Number(r.weight_kg ?? 0), at });
        haveWeight.add(epoch(at));
        changed = true;
      }

      if (!changed) return false;
      data.waterLogs.sort((a, b) => epoch(a.at) - epoch(b.at));
      data.weightLogs.sort((a, b) => epoch(a.at) - epoch(b.at));
      await save(data);
      return true;
    });
  } catch {
    return false;
  }
}

// ── Mutations (the interactive trackers) ────────────────────────────────────

export async function addWater(amountMl: number): Promise<BodyData> {
  const data = await loadBodyData();
  const entry = { amountMl, at: new Date().toISOString() };
  data.waterLogs.push(entry);
  await save(data);
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('water_logs').insert({ id: genId(), user_id: userId, amount_ml: amountMl, logged_at: entry.at });
  });
  // Fan-out — 'water' has been in postWrite's Entity union since it was
  // written but this file never called it (Code Audit v2 fix plan P4): the
  // union advertised support that didn't exist.
  postWrite('water', entry, 'create');
  return data;
}

export async function logWeight(weightKg: number): Promise<BodyData> {
  const data = await loadBodyData();
  const entry = { weightKg, at: new Date().toISOString() };
  data.weightLogs.push(entry);
  await save(data);
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('body_weight_logs').insert({ id: genId(), user_id: userId, weight_kg: weightKg, logged_at: entry.at });
  });
  postWrite('weight', entry, 'create');
  return data;
}

// ── Derived / compute helpers ───────────────────────────────────────────────

export function todaySteps(d: BodyData): number {
  return d.stepsHistory[dateKey(startOfToday())] ?? 0;
}

// Fire-and-forget upsert so server-side buildContext (SharedContext block,
// Code Audit v2 fix plan B2) can see today's step count — previously steps
// lived ONLY in this file's local AsyncStorage blob, invisible to every AI
// companion. AsyncStorage stays the source of truth for the UI; this is a
// one-way mirror, same local-first pattern as every other domain.
export function syncTodayStepsToSupabase(steps: number): void {
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('daily_steps').upsert(
      { user_id: userId, date: dateKey(startOfToday()), steps, source: 'healthkit', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,date' },
    );
  });
}

// Builds a weeks×7 grid of dates, Monday→Sunday columns, today in the last row.
// Days after today (future) are returned as null so they render as blank.
export function buildDayGrid(weeks: number): (Date | null)[][] {
  const today = startOfToday();
  const mondayIdx = (today.getDay() + 6) % 7;            // Mon=0 … Sun=6
  const start = addDays(today, -mondayIdx - (weeks - 1) * 7);
  const grid: (Date | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: (Date | null)[] = [];
    for (let c = 0; c < 7; c++) {
      const d = addDays(start, w * 7 + c);
      row.push(d > today ? null : d);
    }
    grid.push(row);
  }
  return grid;
}

export function stepsSquareState(d: BodyData, day: Date | null): SquareState {
  if (!day) return 'empty';
  const count = d.stepsHistory[dateKey(day)];
  if (count == null) return 'missed';
  const pct = count / d.stepsGoal;
  if (pct >= 1)    return 'hit';
  if (pct >= 0.5)  return 'partial';
  return 'missed';
}

export function trainingDayType(d: BodyData, day: Date | null): DayType | 'empty' {
  if (!day) return 'empty';
  return d.trainingHistory[dateKey(day)] ?? 'missed';
}

export function todayWaterMl(d: BodyData): number {
  const todayKey = dateKey(startOfToday());
  return d.waterLogs
    .filter(l => dateKey(new Date(l.at)) === todayKey)
    .reduce((sum, l) => sum + l.amountMl, 0);
}

export function latestWeight(d: BodyData): number {
  if (d.weightLogs.length === 0) return 0;
  return d.weightLogs[d.weightLogs.length - 1].weightKg;
}

export function weightHistory(d: BodyData, n = 8): number[] {
  return d.weightLogs.slice(-n).map(l => l.weightKg);
}

export const goalStatus = goalStatusPure;
export const formatSleep = formatSleepPure;

function formatActiveTimeHrs(mins: number): string {
  if (mins <= 0) return '0:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function elevationMFromFlights(flights: number): number {
  return Math.round(flights * 3);
}

export function getTrackerBarItems(d: BodyData) {
  const steps = todaySteps(d);
  const act = d.activityToday;

  return [
    {
      icon: 'shoe-print' as const,
      top: "TODAY'S STEPS",
      value: steps > 0 ? steps.toLocaleString() : '—',
      unit: 'STEPS',
    },
    {
      icon: 'clock-outline' as const,
      top: 'ACTIVE TIME',
      value: act ? formatActiveTimeHrs(act.activeMinutes) : '—',
      unit: 'HRS',
    },
    {
      icon: 'fire' as const,
      top: 'CALORIES',
      value: act && act.caloriesKcal > 0 ? act.caloriesKcal.toLocaleString() : '—',
      unit: 'KCAL',
    },
    {
      icon: 'image-filter-hdr' as const,
      top: 'ELEVATION',
      value: act ? String(elevationMFromFlights(act.flightsClimbed)) : '—',
      unit: 'M',
    },
  ];
}
