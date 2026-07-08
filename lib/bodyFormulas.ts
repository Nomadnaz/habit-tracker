// ─────────────────────────────────────────────────────────────────────────
// bodyFormulas.ts — pure computation extracted from lib/body-data.ts
// ─────────────────────────────────────────────────────────────────────────
// Zero React Native / Supabase imports on purpose: these functions take
// already-fetched real data as plain arguments and return a plain result,
// so they're unit-testable with vitest without a native-module shim (the
// app's own react-native/@react-native-async-storage/supabase transitive
// imports use Flow syntax vitest/rolldown can't parse — importing them
// anywhere in a test's import graph breaks the whole test file).
// ─────────────────────────────────────────────────────────────────────────

import { addDaysToKey, toDateKey as dateKey } from './dateKey';
import type { GymPlan, MuscleGroup } from './workout-data';

export type DayType = 'trained' | 'rest' | 'cheat' | 'missed';

// name/icon are the fixed BENCH/SQUAT/DEADLIFT slots this card resolves
// against the user's real exercises (see HEADLINE_LIFT_SLOTS below).
// topSetKg is the max weight ever logged for that exercise's PBs — NOT a
// calculated 1RM (no reps-at-weight data exists to compute one).
export type HeadlineLift = {
  name: string;
  icon: string;
  topSetKg: number;
  deltaKg: number;
  history: number[]; // real chronological PB weights — may be empty or short
};

export type LeastTrainedMuscle = { name: MuscleGroup; sessionsInLast28Days: number };
export type StrengthTrend = { pct: number; history: number[] };
export type NextSession = { name: string; when: string };

export const DOW_FROM_GETDAY: (keyof GymPlan)[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

/** stepsThisYear from real stepsHistory — no year-end reset logic needed, just filter+sum. */
export function stepsThisYearFromHistory(stepsHistory: Record<string, number>): number {
  const year = new Date().getFullYear();
  return Object.entries(stepsHistory).reduce((sum, [key, count]) => {
    const y = parseInt(key.split('-')[0], 10);
    return y === year ? sum + count : sum;
  }, 0);
}

/** Derive trained/rest/cheat/missed for one day from real done-log + gym-plan data. */
export function trainingDayTypeFor(
  day: Date,
  doneDates: Set<string>,
  gymPlan: GymPlan,
): DayType {
  const key = dateKey(day);
  if (doneDates.has(key)) return 'trained';
  const planned = gymPlan[DOW_FROM_GETDAY[day.getDay()]];
  if (planned === 'rest') return 'rest';
  if (planned === 'cheat') return 'cheat';
  return 'missed';
}

const HEADLINE_LIFT_SLOTS: { label: string; icon: string; hints: string[] }[] = [
  { label: 'BENCH PRESS', icon: 'weight-lifter',   hints: ['BENCH'] },
  { label: 'SQUAT',       icon: 'human-handsdown', hints: ['SQUAT'] },
  { label: 'DEADLIFT',    icon: 'weight',          hints: ['DEADLIFT', 'DEAD LIFT'] },
];

/** Resolve the 3 headline-lift slots against real exercises + real PB history. */
export function computeHeadlineLiftsFromData(
  exercises: { id: string; name: string; weightKg: number }[],
  pbLog: { exerciseId: string; weightKg: number; date: string }[],
  todayDateKey: string,
): HeadlineLift[] {
  const out: HeadlineLift[] = [];
  for (const slot of HEADLINE_LIFT_SLOTS) {
    const exercise = exercises.find(e => slot.hints.some(h => e.name.toUpperCase().includes(h)));
    if (!exercise) continue; // user hasn't created this lift yet — omit, don't fabricate

    const history = pbLog
      .filter(e => e.exerciseId === exercise.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (history.length === 0) {
      out.push({ name: slot.label, icon: slot.icon, topSetKg: exercise.weightKg, deltaKg: 0, history: [] });
      continue;
    }

    const weights = history.map(h => h.weightKg);
    const topSetKg = Math.max(...weights);
    const cutoff = addDaysToKey(todayDateKey, -90);
    const inWindow = history.filter(h => h.date >= cutoff);
    const deltaKg = inWindow.length >= 2
      ? inWindow[inWindow.length - 1].weightKg - inWindow[0].weightKg
      : 0;
    out.push({ name: slot.label, icon: slot.icon, topSetKg, deltaKg, history: weights });
  }
  return out;
}

/** Average % change (latest vs. earliest PB within a 90-day window) across lifts with ≥2 entries. */
export function computeStrengthTrendFromLifts(headlineLifts: HeadlineLift[]): StrengthTrend | null {
  const qualifying = headlineLifts.filter(l => l.history.length >= 2);
  if (qualifying.length === 0) return null;

  const pct = Math.round(
    qualifying.reduce((sum, l) => {
      const first = l.history[0];
      const last = l.history[l.history.length - 1];
      return sum + (first > 0 ? ((last - first) / first) * 100 : 0);
    }, 0) / qualifying.length,
  );

  const richest = qualifying.reduce((a, b) => (b.history.length > a.history.length ? b : a));
  return { pct, history: richest.history };
}

/**
 * Trailing-28-day training frequency per muscle group, weighted 1/groupCount
 * per exercise so a multi-group exercise doesn't over-count. Every muscle
 * group that appears on ANY of the user's exercises is considered (not just
 * ones actually trained recently) so an untouched group can surface as
 * least-trained instead of being invisible to the tally.
 */
export function computeLeastTrainedMuscleFromData(
  recentTemplateExercises: { muscleGroups: MuscleGroup[] }[][],
  allExercises: { muscleGroups: MuscleGroup[] }[],
): LeastTrainedMuscle | null {
  const tallies = computeMuscleGroupTalliesFromData(recentTemplateExercises, allExercises);
  if (tallies.length === 0) return null;
  const worst = tallies[0]; // already sorted ascending by count
  return { name: worst.group, sessionsInLast28Days: worst.count };
}

export type MuscleGroupTally = { group: MuscleGroup; count: number };

/**
 * Full per-muscle-group breakdown (ascending by count — least-trained
 * first), for the strength detail page's bar chart. Every group that
 * appears on ANY of the user's exercises is included, even at 0 sessions.
 */
export function computeMuscleGroupTalliesFromData(
  recentTemplateExercises: { muscleGroups: MuscleGroup[] }[][],
  allExercises: { muscleGroups: MuscleGroup[] }[],
): MuscleGroupTally[] {
  const allGroups = new Set<MuscleGroup>();
  for (const ex of allExercises) for (const g of ex.muscleGroups) allGroups.add(g);
  if (allGroups.size === 0) return [];

  const tally: Partial<Record<MuscleGroup, number>> = {};
  for (const exercises of recentTemplateExercises) {
    for (const ex of exercises) {
      const weight = 1 / Math.max(1, ex.muscleGroups.length);
      for (const g of ex.muscleGroups) tally[g] = (tally[g] ?? 0) + weight;
    }
  }

  return [...allGroups]
    .map(group => ({ group, count: Math.round((tally[group] ?? 0) * 10) / 10 }))
    .sort((a, b) => a.count - b.count);
}

/** Tomorrow's planned session from the real gym plan — no fabricated time field (none exists in gym_plan). */
export function computeNextSessionFromPlan(gymPlan: GymPlan, tomorrow: Date): NextSession | null {
  const planned = gymPlan[DOW_FROM_GETDAY[tomorrow.getDay()]];
  if (!planned || planned === 'rest' || planned === 'cheat') return null;
  return { name: `${planned.toUpperCase()} DAY`, when: 'TOMORROW' };
}

// Status label driven by % of goal hit (shared by water / protein / sleep).
export function goalStatus(pct: number): string {
  if (pct >= 1)    return 'GOOD';
  if (pct >= 0.8)  return 'ALMOST';
  if (pct >= 0.5)  return 'OK';
  return 'LOW';
}

export function formatSleep(mins: number | null): string {
  if (mins == null) return '—';
  return `${Math.floor(mins / 60)}H ${mins % 60}M`;
}
