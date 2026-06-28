// ─────────────────────────────────────────────────────────────────────────
// CALORIE PAGE — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Single source of truth for logged meals + nutrition targets. Same
// "local-first" pattern as body-data.ts: everything lives in AsyncStorage so
// the UI is instant and works offline, then each mutation fires-and-forgets to
// the Supabase `meals` / `nutrition_targets` tables and runs postWrite().
//
// Dates are keyed with the canonical zero-padded YYYY-MM-DD (lib/dateKey.ts),
// never toISOString() (that would be UTC, not the user's local day).
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey } from './dateKey';
import { postWrite } from './postWrite';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const MEALS_KEY   = '@meals';            // Record<dateKey, Meal[]>
const TARGETS_KEY = '@nutrition_targets';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type Meal = {
  id: string;
  date: string;          // canonical YYYY-MM-DD
  mealType: MealType;
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  photoUrl?: string;     // local file URI for MVP (Storage upload is a later step)
  loggedVia: 'manual' | 'photo' | 'quick_add';
  createdAt: string;     // ISO timestamp
};

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
};

// Sensible defaults until onboarding (task 060) seeds real targets.
const DEFAULT_TARGETS: NutritionTargets = {
  calories: 2000, proteinG: 150, carbsG: 200, fatG: 65, waterMl: 3000,
};

export type DailyTotals = { calories: number; proteinG: number; carbsG: number; fatG: number };

// ── Date helper ──────────────────────────────────────────────────────────────
export function todayKey(): string { return toDateKey(new Date()); }

// ── Meals: load / mutate ─────────────────────────────────────────────────────

type MealMap = Record<string, Meal[]>;

async function loadMealMap(): Promise<MealMap> {
  try {
    const raw = await AsyncStorage.getItem(MEALS_KEY);
    if (raw) return JSON.parse(raw) as MealMap;
  } catch { /* fall through */ }
  return {};
}

async function saveMealMap(map: MealMap): Promise<void> {
  await AsyncStorage.setItem(MEALS_KEY, JSON.stringify(map));
}

export async function getMealsForDate(dateKey: string): Promise<Meal[]> {
  const map = await loadMealMap();
  return map[dateKey] ?? [];
}

function toDbRow(m: Meal, userId: string) {
  return {
    id: m.id, user_id: userId, date: m.date, meal_type: m.mealType, name: m.name,
    calories: m.calories, protein_g: m.proteinG, carbs_g: m.carbsG, fat_g: m.fatG,
    photo_url: m.photoUrl ?? null, logged_via: m.loggedVia,
  };
}

export async function addMeal(input: Omit<Meal, 'id' | 'createdAt'>): Promise<Meal> {
  const meal: Meal = { ...input, id: genId(), createdAt: new Date().toISOString() };
  const map = await loadMealMap();
  map[meal.date] = [...(map[meal.date] ?? []), meal];
  await saveMealMap(map);

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('meals').insert(toDbRow(meal, userId));
  });
  // Fan-out (cumulative stats / streaks / Obsidian, all behind flags for now).
  postWrite('meal', meal, 'create');
  return meal;
}

export async function updateMeal(meal: Meal): Promise<void> {
  const map = await loadMealMap();
  const day = map[meal.date] ?? [];
  map[meal.date] = day.map(m => (m.id === meal.id ? meal : m));
  await saveMealMap(map);

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('meals').update(toDbRow(meal, userId)).eq('id', meal.id).eq('user_id', userId);
  });
  postWrite('meal', meal, 'update');
}

export async function deleteMeal(dateKey: string, mealId: string): Promise<void> {
  const map = await loadMealMap();
  map[dateKey] = (map[dateKey] ?? []).filter(m => m.id !== mealId);
  await saveMealMap(map);

  bg(async () => { await supabase.from('meals').delete().eq('id', mealId); });
}

/** Most-recent distinct meals (by name) for the quick-add row. */
export async function getRecentMeals(limit = 8): Promise<Meal[]> {
  const map = await loadMealMap();
  const all = Object.values(map).flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = new Set<string>();
  const out: Meal[] = [];
  for (const m of all) {
    const key = m.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Totals ───────────────────────────────────────────────────────────────────

export function dailyTotals(meals: Meal[]): DailyTotals {
  return meals.reduce<DailyTotals>(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      proteinG: acc.proteinG + m.proteinG,
      carbsG:   acc.carbsG   + m.carbsG,
      fatG:     acc.fatG     + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

// ── Targets ──────────────────────────────────────────────────────────────────

export async function getTargets(): Promise<NutritionTargets> {
  try {
    const raw = await AsyncStorage.getItem(TARGETS_KEY);
    if (raw) return JSON.parse(raw) as NutritionTargets;
  } catch { /* fall through */ }
  await AsyncStorage.setItem(TARGETS_KEY, JSON.stringify(DEFAULT_TARGETS));
  return DEFAULT_TARGETS;
}

export async function saveTargets(t: NutritionTargets): Promise<void> {
  await AsyncStorage.setItem(TARGETS_KEY, JSON.stringify(t));
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('nutrition_targets').upsert({
      user_id: userId, calories: t.calories, protein_g: t.proteinG,
      carbs_g: t.carbsG, fat_g: t.fatG, water_ml: t.waterMl,
      last_updated: new Date().toISOString(),
    });
  });
}
