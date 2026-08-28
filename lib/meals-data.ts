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
import { withStorageLock } from './storageLock';
import {
  computeTargets, DEFAULT_TARGETS,
  type NutritionTargets, type ProfileForTargets,
} from './nutritionFormulas';
export { computeTargets, type NutritionTargets, type ProfileForTargets };

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

// ── Down-sync ────────────────────────────────────────────────────────────────
// This layer is local-first and, until now, ONE-WAY: every mutation pushed up
// to Supabase and nothing ever came back. That is fine while the phone is the
// only writer -- but the voice device writes server-side (device-log, and
// ai-chat with execute:true), so a meal logged by voice landed in the `meals`
// table and was invisible in the app forever. Reported on hardware 2026-08-28:
// "it says it logged it but it's not appearing in the app anywhere".
//
// Tasks never had this problem because `tasks` is in the supabase_realtime
// publication (migration 008) and the app applies those events locally.
// Nothing else is, so every other domain the device can log needs a pull.
//
// Merge rules, in order of what they protect:
//  - Local wins on id collision. A row edited offline must not be clobbered by
//    the older server copy it hasn't been pushed to yet.
//  - Server rows absent locally are added. This is the device's writes landing.
//  - A local row missing from the server is KEPT, never deleted. It is far more
//    likely to be an unsynced offline write than a real remote deletion, and
//    silently eating someone's logged food is the worst failure here.
const fromDbRow = (r: Record<string, unknown>): Meal => ({
  id: String(r.id),
  date: String(r.date),
  mealType: (r.meal_type as Meal['mealType']) ?? 'snack',
  name: String(r.name ?? 'Meal'),
  calories: Number(r.calories ?? 0),
  proteinG: Number(r.protein_g ?? 0),
  carbsG: Number(r.carbs_g ?? 0),
  fatG: Number(r.fat_g ?? 0),
  photoUrl: (r.photo_url as string) ?? undefined,
  loggedVia: (r.logged_via as Meal['loggedVia']) ?? 'manual',
  createdAt: String(r.created_at ?? new Date().toISOString()),
});

/**
 * Pulls the server's meals for one day into local storage. Safe to call on
 * every screen focus: it is a single indexed query and a no-op when nothing
 * new arrived. Never throws -- offline is the normal case for this app, and a
 * failed sync must leave the local data exactly as it was.
 *
 * Returns true when local storage actually changed, so callers can skip a
 * re-render they don't need.
 */
export async function pullRemoteMeals(dateKey: string): Promise<boolean> {
  try {
    const userId = await getUid();
    if (!userId) return false;

    const { data, error } = await supabase
      .from('meals')
      .select('id, date, meal_type, name, calories, protein_g, carbs_g, fat_g, photo_url, logged_via, created_at')
      .eq('user_id', userId)
      .eq('date', dateKey);
    if (error || !data) return false;

    return await withStorageLock(MEALS_KEY, async () => {
      const map = await loadMealMap();
      const local = map[dateKey] ?? [];
      const localIds = new Set(local.map((m) => m.id));

      const incoming = data.filter((r) => !localIds.has(String(r.id))).map(fromDbRow);
      if (incoming.length === 0) return false;

      map[dateKey] = [...local, ...incoming].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      await saveMealMap(map);
      return true;
    });
  } catch {
    return false;
  }
}

function toDbRow(m: Meal, userId: string) {
  return {
    id: m.id, user_id: userId, date: m.date, meal_type: m.mealType, name: m.name,
    calories: m.calories, protein_g: m.proteinG, carbs_g: m.carbsG, fat_g: m.fatG,
    photo_url: m.photoUrl ?? null, logged_via: m.loggedVia,
  };
}

// Uploads a local photo (file:// URI) to the private meal-photos bucket
// (migration 025) and returns a long-lived signed URL — the local file URI
// keeps working as the instant, offline AsyncStorage value; only the
// SYNCED copy becomes a real, durable URL, which is what actually needs
// to survive a reinstall.
async function uploadMealPhoto(userId: string, mealId: string, localUri: string): Promise<string | null> {
  try {
    const blob = await (await fetch(localUri)).blob();
    const path = `${userId}/${mealId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('meal-photos')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) return null;

    const { data, error: signError } = await supabase.storage
      .from('meal-photos')
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 years
    if (signError || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function addMeal(input: Omit<Meal, 'id' | 'createdAt'>): Promise<Meal> {
  const meal: Meal = { ...input, id: genId(), createdAt: new Date().toISOString() };
  await withStorageLock(MEALS_KEY, async () => {
    const map = await loadMealMap();
    map[meal.date] = [...(map[meal.date] ?? []), meal];
    await saveMealMap(map);
  });

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('meals').insert(toDbRow(meal, userId));
    if (meal.photoUrl?.startsWith('file://')) {
      const signedUrl = await uploadMealPhoto(userId, meal.id, meal.photoUrl);
      if (signedUrl) await supabase.from('meals').update({ photo_url: signedUrl }).eq('id', meal.id).eq('user_id', userId);
    }
  });
  // Fan-out (cumulative stats / streaks / Obsidian, all behind flags for now).
  postWrite('meal', meal, 'create');
  return meal;
}

export async function updateMeal(meal: Meal): Promise<void> {
  await withStorageLock(MEALS_KEY, async () => {
    const map = await loadMealMap();
    const day = map[meal.date] ?? [];
    map[meal.date] = day.map(m => (m.id === meal.id ? meal : m));
    await saveMealMap(map);
  });

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('meals').update(toDbRow(meal, userId)).eq('id', meal.id).eq('user_id', userId);
    if (meal.photoUrl?.startsWith('file://')) {
      const signedUrl = await uploadMealPhoto(userId, meal.id, meal.photoUrl);
      if (signedUrl) await supabase.from('meals').update({ photo_url: signedUrl }).eq('id', meal.id).eq('user_id', userId);
    }
  });
  postWrite('meal', meal, 'update');
}

export async function deleteMeal(dateKey: string, mealId: string): Promise<void> {
  await withStorageLock(MEALS_KEY, async () => {
    const map = await loadMealMap();
    map[dateKey] = (map[dateKey] ?? []).filter(m => m.id !== mealId);
    await saveMealMap(map);
  });

  bg(async () => { await supabase.from('meals').delete().eq('id', mealId); });
  // Fan-out — known gap since handover-3 (Code Audit v2 fix plan P4):
  // deleted meals previously left stats uncorrected.
  postWrite('meal', { id: mealId, date: dateKey }, 'delete');
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
