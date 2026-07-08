// ─────────────────────────────────────────────────────────────────────────
// STEPS PAGE — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Step count / goal / weekly bars / heatmap come from body-data (single
// source of truth). Weekly distance / monthly elevation are real rollups
// over lib/activity-data.ts's saved GPS activities — no local run-tracking
// system lives here anymore.
//
// An audit (2026-07-07) found this file used to have its OWN, independent,
// fully-fake run tracker: startRun()/endRun() fabricated distance/pace from
// elapsed time at a hardcoded 9.6 km/h with zero GPS, entirely bypassing the
// real GPS-based tracker in lib/activity-data.ts + app/(tabs)/activity.tsx.
// That's gone — the STEPS screen's "start a run" action now routes to the
// real Activity tab, and its "recent run" card reads real saved activities.
// ─────────────────────────────────────────────────────────────────────────

import { getActivitiesInRange, getRecentActivities, type Activity } from './activity-data';
import { loadBodyData, dateKey, type BodyData } from './body-data';

const WEEKLY_DISTANCE_GOAL_KM = 20;      // sane default goal, not fabricated history
const MONTHLY_ELEVATION_GOAL_KM = 5;     // ditto

// ── Status helper (hit / partial / missed) ─────────────────────────────────
export type GoalStatus = 'hit' | 'partial' | 'missed';
export function getGoalStatus(value: number, goal: number): GoalStatus {
  const pct = goal > 0 ? value / goal : 0;
  if (pct >= 1)   return 'hit';
  if (pct >= 0.5) return 'partial';
  return 'missed';
}

// ── Real rollups over saved activities ──────────────────────────────────────

function startOfWeek(d: Date): Date {
  const out = new Date(d); out.setHours(0, 0, 0, 0);
  const mondayIdx = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - mondayIdx);
  return out;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export type StepsWeeklyStats = {
  weeklyDistanceKm: number;
  weeklyDistanceGoalKm: number;
  monthlyElevationKm: number;
  monthlyElevationGoalKm: number;
  recentActivity: Activity | null;
};

export async function loadStepsWeeklyStats(): Promise<StepsWeeklyStats> {
  const now = new Date();
  const [weekActivities, monthActivities, recent] = await Promise.all([
    getActivitiesInRange(startOfWeek(now).toISOString(), now.toISOString()),
    getActivitiesInRange(startOfMonth(now).toISOString(), now.toISOString()),
    getRecentActivities(1),
  ]);

  const weeklyDistanceKm = weekActivities.reduce((sum, a) => sum + a.distanceM, 0) / 1000;
  const monthlyElevationKm = monthActivities.reduce((sum, a) => sum + a.elevationGainM, 0) / 1000;

  return {
    weeklyDistanceKm: Math.round(weeklyDistanceKm * 100) / 100,
    weeklyDistanceGoalKm: WEEKLY_DISTANCE_GOAL_KM,
    monthlyElevationKm: Math.round(monthlyElevationKm * 100) / 100,
    monthlyElevationGoalKm: MONTHLY_ELEVATION_GOAL_KM,
    recentActivity: recent[0] ?? null,
  };
}

// ── Derived helpers (real, from body-data's real stepsHistory) ─────────────

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

export function formatPace(secPerKm?: number): string {
  if (!secPerKm) return '--:--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
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

// Re-exported so app/steps.tsx doesn't need a second import for the body layer.
export { loadBodyData, dateKey, type BodyData };
