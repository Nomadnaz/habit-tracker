// ─────────────────────────────────────────────────────────────────────────
// FOOD VISION — the single AI integration point for snap-a-picture logging
// ─────────────────────────────────────────────────────────────────────────
// estimateMealFromPhoto() calls the dedicated `food-vision` Edge Function,
// which runs a Claude Haiku vision call server-side (the Anthropic key never
// leaves the server). If the function isn't deployed yet, or anything fails,
// we return a clearly-labeled MOCK estimate so the whole capture → confirm →
// save flow is demoable immediately. Converging onto the shared `ai-chat`
// function later is a one-line change to the invoke() target below.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export type MealEstimate = {
  name: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  isEstimate: true;          // always an estimate — the UI must say so
  source: 'ai' | 'mock';     // 'mock' => backend not wired; surface this to the user
};

// A deliberately generic, plausible plate. Labeled source:'mock' so the UI can
// tell the user this isn't a real vision result yet.
function mockEstimate(): MealEstimate {
  return {
    name: 'Meal (estimate)',
    calories: 520,
    proteinG: 30,
    carbsG: 45,
    fatG: 22,
    isEstimate: true,
    source: 'mock',
  };
}

function coerceNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param base64Jpeg compressed (<1MB) JPEG image as a base64 string (no data: prefix)
 */
export async function estimateMealFromPhoto(base64Jpeg: string): Promise<MealEstimate> {
  try {
    const { data, error } = await supabase.functions.invoke('food-vision', {
      body: { image: base64Jpeg },
    });
    if (error || !data) return mockEstimate();

    return {
      name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Meal',
      calories: Math.round(coerceNumber(data.calories)),
      proteinG: Math.round(coerceNumber(data.protein_g)),
      carbsG: Math.round(coerceNumber(data.carbs_g)),
      fatG: Math.round(coerceNumber(data.fat_g)),
      isEstimate: true,
      source: 'ai',
    };
  } catch {
    // Function not deployed / network error / bad JSON — degrade to the mock.
    return mockEstimate();
  }
}
