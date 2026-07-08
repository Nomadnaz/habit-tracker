// ─────────────────────────────────────────────────────────────────────────
// nutritionFormulas.ts — pure computation extracted from lib/meals-data.ts
// ─────────────────────────────────────────────────────────────────────────
// Zero React Native / Supabase imports on purpose — see lib/bodyFormulas.ts's
// header for why (RN's own source uses Flow syntax vitest/rolldown can't
// parse, so anything importing it breaks the whole test file).
// ─────────────────────────────────────────────────────────────────────────

export type NutritionTargets = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  waterMl: number;
};

export type ProfileForTargets = {
  age?: number;
  sex?: string;
  heightCm?: number;
  weightKg?: number;
};

// Fallback when the profile is missing/incomplete — an honest "assumed
// average adult" default, not a personalized number.
export const DEFAULT_TARGETS: NutritionTargets = {
  calories: 2000, proteinG: 150, carbsG: 200, fatG: 65, waterMl: 3000,
};

// Mifflin-St Jeor BMR × a fixed "lightly active" multiplier. Onboarding
// doesn't collect an activity-level field, so this is the best available
// single constant rather than a per-user activity estimate — flagged here,
// not silently presented as precise.
const ACTIVITY_MULTIPLIER = 1.375;

/** Real BMR-based targets when age/height/weight are known; honest DEFAULT_TARGETS fallback otherwise. */
export function computeTargets(profile: ProfileForTargets): NutritionTargets {
  const { age, sex, heightCm, weightKg } = profile;
  if (age == null || !heightCm || !weightKg) return { ...DEFAULT_TARGETS };

  // Female offset (-161) and Male offset (+5) per Mifflin-St Jeor; a midpoint
  // is used for 'Other'/'Prefer not to say' since the formula has no neutral term.
  const sexOffset = sex === 'Male' ? 5 : sex === 'Female' ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  const calories = Math.round(bmr * ACTIVITY_MULTIPLIER);

  const proteinG = Math.round(weightKg * 1.6);
  const fatCalories = calories * 0.25;
  const fatG = Math.round(fatCalories / 9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatCalories) / 4));

  return { calories, proteinG, carbsG, fatG, waterMl: DEFAULT_TARGETS.waterMl };
}
