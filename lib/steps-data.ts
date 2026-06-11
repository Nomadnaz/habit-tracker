// ─────────────────────────────────────────────────────────────────────────
// STEPS PAGE — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// The actual STEP COUNT, STEP GOAL, weekly bars and heatmap all come from the
// existing body-data store (single source of truth — no duplication).
// This module only adds the steps-page-specific extras that don't exist yet:
// distance, calories, active time, elevation, the weekly-distance / monthly-
// elevation goals, and the runs log. Local-first (AsyncStorage), same pattern
// as body-data.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadBodyData, dateKey, type BodyData } from './body-data';

const STEPS_KEY = '@steps';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── Types ────────────────────────────────────────────────────────────────

export type Run = {
  id: string;
  startedAt: string;          // ISO
  distanceKm: number;
  durationSec: number;
  avgPaceSecPerKm: number;
  bestPaceSecPerKm: number;
  avgSpeedKph: number;
  calories: number;
};

export type StepsData = {
  // Today's activity headline metrics (mock-matched on first launch)
  todayDistanceKm: number;
  todayCalories: number;
  todayActiveMins: number;
  todayElevationM: number;

  // Weekly distance goal
  weeklyDistanceKm: number;
  weeklyDistanceGoalKm: number;

  // Monthly elevation goal (in km of cumulative climb)
  monthlyElevationKm: number;
  monthlyElevationGoalKm: number;

  // Runs (newest first)
  runs: Run[];

  // ISO timestamp while a run is being tracked; null when idle
  activeRunStart: string | null;
};

// ── Status helper (hit / partial / missed) ─────────────────────────────────
export type GoalStatus = 'hit' | 'partial' | 'missed';
export function getGoalStatus(value: number, goal: number): GoalStatus {
  const pct = goal > 0 ? value / goal : 0;
  if (pct >= 1)   return 'hit';
  if (pct >= 0.5) return 'partial';
  return 'missed';
}

// ── Seed (matches the design mock exactly) ─────────────────────────────────
function seed(): StepsData {
  const now = new Date();
  const may14 = new Date(now.getFullYear(), 4, 14, 7, 32, 0); // MAY 14, 07:32
  return {
    todayDistanceKm: 4.32,
    todayCalories: 1126,
    todayActiveMins: 134,        // 2:14
    todayElevationM: 612,

    weeklyDistanceKm: 22.4,
    weeklyDistanceGoalKm: 35,

    monthlyElevationKm: 12.6,
    monthlyElevationGoalKm: 20,

    runs: [
      {
        id: genId(),
        startedAt: may14.toISOString(),
        distanceKm: 5.21,
        durationSec: 28 * 60 + 47,      // 28:47
        avgPaceSecPerKm: 5 * 60 + 31,   // 5:31 /km
        bestPaceSecPerKm: 5 * 60 + 21,  // 5:21 /km
        avgSpeedKph: 10.9,
        calories: 312,
      },
    ],
    activeRunStart: null,
  };
}

// ── Load / save ─────────────────────────────────────────────────────────────
export async function loadStepsData(): Promise<StepsData> {
  try {
    const raw = await AsyncStorage.getItem(STEPS_KEY);
    if (raw) return JSON.parse(raw) as StepsData;
  } catch { /* fall through */ }
  const seeded = seed();
  await AsyncStorage.setItem(STEPS_KEY, JSON.stringify(seeded));
  return seeded;
}

async function save(data: StepsData): Promise<void> {
  await AsyncStorage.setItem(STEPS_KEY, JSON.stringify(data));
}

// ── Run tracking (START RUN button) ─────────────────────────────────────────
export async function startRun(): Promise<StepsData> {
  const data = await loadStepsData();
  data.activeRunStart = new Date().toISOString();
  await save(data);
  return data;
}

// Ends the active run, derives plausible stats from elapsed time (no GPS in
// Expo Go), saves it to the top of the runs list.
export async function endRun(): Promise<StepsData> {
  const data = await loadStepsData();
  if (!data.activeRunStart) return data;

  const start = new Date(data.activeRunStart);
  const durationSec = Math.max(1, Math.round((Date.now() - start.getTime()) / 1000));

  const speedKph = 9.6;                                  // ~6:15/km easy pace
  const distanceKm = +(durationSec / 3600 * speedKph).toFixed(2);
  const avgPace = distanceKm > 0 ? Math.round(durationSec / distanceKm) : 0;

  const run: Run = {
    id: genId(),
    startedAt: data.activeRunStart,
    distanceKm,
    durationSec,
    avgPaceSecPerKm: avgPace,
    bestPaceSecPerKm: Math.round(avgPace * 0.96),
    avgSpeedKph: +speedKph.toFixed(1),
    calories: Math.round(distanceKm * 62),
  };

  data.runs = [run, ...data.runs];
  data.activeRunStart = null;
  // Roll today's distance forward so the headline reflects the run.
  data.todayDistanceKm = +(data.todayDistanceKm + distanceKm).toFixed(2);
  await save(data);
  return data;
}

// ── Derived helpers ─────────────────────────────────────────────────────────

// Last 7 calendar days (Mon→Sun of the current week) of step counts, for bars.
export function weekStepBars(body: BodyData): { day: string; steps: number; isToday: boolean }[] {
  const labels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const mondayIdx = (today.getDay() + 6) % 7;
  const monday = new Date(today); monday.setDate(today.getDate() - mondayIdx);
  return labels.map((day, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return {
      day,
      steps: d > today ? 0 : (body.stepsHistory[dateKey(d)] ?? 0),
      isToday: d.getTime() === today.getTime(),
    };
  });
}

// Recent days with logged steps → mountain milestone pins (oldest → newest).
export function recentStepPins(body: BodyData, count = 4): {
  date: Date; label: string; steps: number; status: GoalStatus;
}[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const out: { date: Date; label: string; steps: number; status: GoalStatus }[] = [];
  for (let i = count; i >= 1; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const steps = body.stepsHistory[dateKey(d)] ?? 0;
    out.push({
      date: d,
      label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      steps,
      status: getGoalStatus(steps, body.stepsGoal),
    });
  }
  return out;
}

export function daysLeftInWeek(): number {
  const today = new Date();
  const mondayIdx = (today.getDay() + 6) % 7;     // Mon=0 … Sun=6
  return 6 - mondayIdx;                            // days until Sunday
}

export function daysLeftInMonth(): number {
  const today = new Date();
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return last - today.getDate();
}

// ── Formatters ───────────────────────────────────────────────────────────────
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatActiveTime(mins: number): string {
  return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
}

export function formatRunDate(iso: string): string {
  const d = new Date(iso);
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} AT ${h}:${min} ${ampm}`;
}
