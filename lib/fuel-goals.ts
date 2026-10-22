// ─────────────────────────────────────────────────────────────────────────
// One fuel goal (kcal, protein, carbs, fat or sugar) judged day by day,
// for the goal page (app/calorie/goal.tsx) and its calendar.
//
//   floor (protein)       hit at 100%+, halfway from 50%
//   plan  (kcal/carb/fat) hit within 90–115%, halfway from 50%, over 115% missed
//   limit (sugar)         hit at or under the limit, halfway up to 125%
//
// A day with no meals logged is 'none', not a miss. Every past day is
// judged against today's goal — the app doesn't keep a history of goals.
// Pure (no AsyncStorage) so it can be tested.
// ─────────────────────────────────────────────────────────────────────────

import { toDateKey } from './dateKey';
import type { Meal } from './meals-data';

export type FuelKey = 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'sugarG';
export type GoalKind = 'floor' | 'plan' | 'limit';
export type DayStatus = 'hit' | 'half' | 'miss' | 'none';

export const FUEL_GOALS: Record<FuelKey, { word: string; unit: string; kind: GoalKind; step: number; min: number; max: number; rule: string }> = {
  calories: { word: 'CALORIES', unit: 'KCAL', kind: 'plan', step: 50, min: 1000, max: 6000, rule: 'Hit = 90–115% of the goal. Over 115% counts as a miss.' },
  proteinG: { word: 'PROTEIN', unit: 'G', kind: 'floor', step: 5, min: 20, max: 400, rule: 'Hit = reach the goal. Halfway = at least half of it.' },
  carbsG:   { word: 'CARBS', unit: 'G', kind: 'plan', step: 5, min: 20, max: 800, rule: 'Hit = 90–115% of the goal. Over 115% counts as a miss.' },
  fatG:     { word: 'FAT', unit: 'G', kind: 'plan', step: 5, min: 10, max: 300, rule: 'Hit = 90–115% of the goal. Over 115% counts as a miss.' },
  sugarG:   { word: 'SUGAR', unit: 'G', kind: 'limit', step: 5, min: 5, max: 300, rule: 'A limit: hit = stay under it. Halfway = up to 25% over.' },
};

export function judgeDay(value: number, goal: number, kind: GoalKind): Exclude<DayStatus, 'none'> {
  if (goal <= 0) return 'miss';
  const p = value / goal;
  if (kind === 'limit') return p <= 1 ? 'hit' : p <= 1.25 ? 'half' : 'miss';
  if (kind === 'floor') return p >= 1 ? 'hit' : p >= 0.5 ? 'half' : 'miss';
  return p > 1.15 ? 'miss' : p >= 0.9 ? 'hit' : p >= 0.5 ? 'half' : 'miss';
}

export type GoalDay = { key: string; date: Date; value: number; status: DayStatus; future: boolean };

const sum = (meals: Meal[], key: FuelKey) => meals.reduce((a, m) => a + (Number(m[key]) || 0), 0);

/** Every day of the month containing `month`, judged. Days after `today` are future. */
export function monthDays(map: Record<string, Meal[]>, key: FuelKey, goal: number, month: Date, today = new Date()): GoalDay[] {
  const y = month.getFullYear(), mo = month.getMonth();
  const n = new Date(y, mo + 1, 0).getDate();
  const todayKey = toDateKey(today);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Array.from({ length: n }, (_, i) => {
    const date = new Date(y, mo, i + 1);
    const k = toDateKey(date);
    const meals = map[k] ?? [];
    const future = date.getTime() > end;
    const value = sum(meals, key);
    let status: DayStatus = future || meals.length === 0 ? 'none' : judgeDay(value, goal, FUEL_GOALS[key].kind);
    // Today isn't over: short of a floor or plan goal is still in progress, not a miss.
    if (k === todayKey && status !== 'hit' && FUEL_GOALS[key].kind !== 'limit') status = 'none';
    return { key: k, date, value, status, future };
  });
}

export function tally(days: GoalDay[]): Record<DayStatus, number> {
  const t = { hit: 0, half: 0, miss: 0, none: 0 };
  for (const d of days) if (!d.future) t[d.status]++;
  return t;
}

/** Consecutive hit days ending today (or yesterday, if today isn't hit yet). */
export function streak(map: Record<string, Meal[]>, key: FuelKey, goal: number, today = new Date()): number {
  let n = 0;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  for (let i = 0; i < 400; i++) {
    const meals = map[toDateKey(d)] ?? [];
    const hit = meals.length > 0 && judgeDay(sum(meals, key), goal, FUEL_GOALS[key].kind) === 'hit';
    if (hit) n++;
    else if (i > 0) break;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
