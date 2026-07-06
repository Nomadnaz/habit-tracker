// ─────────────────────────────────────────────────────────────────────────
// ONBOARDING — local answer store + post-account flush (task 062)
// ─────────────────────────────────────────────────────────────────────────
// Screens 1-8 run before an account exists (account creation is deliberately
// screen 9), so every answer is collected into one local AsyncStorage blob.
// Supabase's default signUp() does NOT always return a session immediately —
// if email confirmation is required, the session only appears after the user
// confirms and logs in, possibly in a later app launch. flushOnboardingIfNeeded()
// is written to be safe to call from anywhere a session might have just
// appeared (the account screen right after signUp, and app/_layout.tsx's
// session effect on every login) — it only does work once, then clears the
// answers so it can't double-write.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { addHabit, type Frequency } from './habits-data';
import { saveTargets, type NutritionTargets } from './meals-data';

const ANSWERS_KEY = '@onboarding_answers';
const DONE_KEY = '@onboarding_complete';

export type OnboardingAnswers = {
  name?: string;
  age?: number;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
  goals?: string[];
  targets?: NutritionTargets;
  firstHabit?: { name: string; frequency: Frequency };
  skills?: string[];
  healthKitConnected?: boolean;
  briefingModules?: string[];
};

export async function getAnswers(): Promise<OnboardingAnswers> {
  try {
    const raw = await AsyncStorage.getItem(ANSWERS_KEY);
    if (raw) return JSON.parse(raw) as OnboardingAnswers;
  } catch { /* fall through */ }
  return {};
}

export async function updateAnswers(patch: Partial<OnboardingAnswers>): Promise<OnboardingAnswers> {
  const current = await getAnswers();
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(ANSWERS_KEY, JSON.stringify(next));
  return next;
}

/** Local-only, synchronous-feeling check used by app/_layout.tsx to route. */
export async function isOnboardingComplete(): Promise<boolean> {
  return (await AsyncStorage.getItem(DONE_KEY)) === 'true';
}

/** Used by the welcome screen's "I already have an account" shortcut. */
export async function skipOnboarding(): Promise<void> {
  await AsyncStorage.setItem(DONE_KEY, 'true');
  await AsyncStorage.removeItem(ANSWERS_KEY);
}

// In-flight guard: app/_layout.tsx calls flushOnboardingIfNeeded() from both
// its initial getSession() check AND its onAuthStateChange subscription,
// which both fire on the same login — an audit (2026-07-06) found this let
// two concurrent flushes read the same pending answers before either
// cleared them, writing the first habit (addHabit) twice. Every caller
// awaits the SAME in-flight promise instead of starting a second run.
let flushInFlight: Promise<void> | null = null;

/**
 * Runs once a real Supabase session exists: writes the locally-collected
 * answers into user_profiles/nutrition_targets/habits/briefing_preferences,
 * then clears the local answers and marks onboarding done. Safe to call
 * repeatedly and concurrently — it no-ops once the answers are gone, and
 * concurrent calls share one in-flight run rather than racing.
 */
export async function flushOnboardingIfNeeded(): Promise<void> {
  if (flushInFlight) return flushInFlight;
  flushInFlight = doFlush().finally(() => { flushInFlight = null; });
  return flushInFlight;
}

async function doFlush(): Promise<void> {
  if (await isOnboardingComplete()) return;
  const answers = await getAnswers();
  if (Object.keys(answers).length === 0) return; // nothing pending, e.g. skipOnboarding() path

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return; // no session yet — try again next time a session appears

  await supabase.from('user_profiles').upsert({
    user_id: userId,
    name: answers.name ?? null,
    age: answers.age ?? null,
    sex: answers.sex ?? null,
    height_cm: answers.heightCm ?? null,
    weight_kg: answers.weightKg ?? null,
    onboarding_complete: true,
  });

  if (answers.targets) await saveTargets(answers.targets);
  if (answers.firstHabit?.name) await addHabit(answers.firstHabit);

  if (answers.briefingModules?.length) {
    await supabase.from('briefing_preferences').upsert({
      user_id: userId,
      selected_modules: answers.briefingModules,
      updated_at: new Date().toISOString(),
    });
  }

  await AsyncStorage.setItem(DONE_KEY, 'true');
  await AsyncStorage.removeItem(ANSWERS_KEY);
}
