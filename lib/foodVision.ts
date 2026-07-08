// ─────────────────────────────────────────────────────────────────────────
// FOOD VISION — the single AI integration point for snap-a-picture logging
// ─────────────────────────────────────────────────────────────────────────
// estimateMealFromPhoto() calls the dedicated `food-vision` Edge Function,
// which runs a Claude Haiku vision call server-side (the Anthropic key never
// leaves the server).
//
// An audit (2026-07-07) found this used to silently fall back to a
// hardcoded 520-calorie "Meal (estimate)" plate on ANY failure (network,
// undeployed function, bad JSON) — indistinguishable from a real result
// except a small banner label. That's gone: on failure this now returns
// `null`, and the confirm screen shows a blank, editable form with the
// photo attached instead of inventing numbers nobody generated.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export type MealEstimate = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isEstimate: true; // always an estimate — the UI must say so
};

function coerceNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param base64Jpeg compressed (<1MB) JPEG image as a base64 string (no data: prefix)
 * @returns the AI estimate, or `null` if the function isn't reachable/deployed
 *          or returned something unusable — never a fabricated placeholder.
 */
export async function estimateMealFromPhoto(base64Jpeg: string): Promise<MealEstimate | null> {
  try {
    const { data, error } = await supabase.functions.invoke('food-vision', {
      body: { image: base64Jpeg },
    });
    if (error || !data) return null;

    return {
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Meal',
      calories: Math.round(coerceNumber(data.calories)),
      proteinG: Math.round(coerceNumber(data.protein_g)),
      carbsG: Math.round(coerceNumber(data.carbs_g)),
      fatG: Math.round(coerceNumber(data.fat_g)),
      isEstimate: true,
    };
  } catch {
    // Function not deployed / network error / bad JSON — no fabricated fallback.
    return null;
  }
}
