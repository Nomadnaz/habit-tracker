import { describe, it, expect } from 'vitest';
import { computeTargets } from './nutritionFormulas';

describe('computeTargets', () => {
  it('falls back to the honest default when the profile is incomplete', () => {
    expect(computeTargets({})).toEqual({ calories: 2000, proteinG: 150, carbsG: 200, fatG: 65, waterMl: 3000 });
    expect(computeTargets({ age: 30 })).toEqual({ calories: 2000, proteinG: 150, carbsG: 200, fatG: 65, waterMl: 3000 });
  });

  it('computes real Mifflin-St Jeor targets for a male profile', () => {
    const t = computeTargets({ age: 30, sex: 'Male', heightCm: 180, weightKg: 80 });
    // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5 = 1780; ×1.375 = 2447.5
    expect(t.calories).toBe(2448);
    expect(t.proteinG).toBe(128); // 80 * 1.6
    expect(t.waterMl).toBe(3000);
  });

  it('computes real Mifflin-St Jeor targets for a female profile', () => {
    const t = computeTargets({ age: 30, sex: 'Female', heightCm: 165, weightKg: 60 });
    // BMR = 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25; ×1.375 = 1815.34
    expect(t.calories).toBe(1815);
    expect(t.proteinG).toBe(96); // 60 * 1.6
  });

  it('macros always sum consistently with the reported calories (within rounding)', () => {
    const t = computeTargets({ age: 45, sex: 'Other', heightCm: 170, weightKg: 70 });
    const kcalFromMacros = t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9;
    expect(Math.abs(kcalFromMacros - t.calories)).toBeLessThan(15);
  });

  it('never produces negative carbs even at very low calorie/high protein extremes', () => {
    const t = computeTargets({ age: 80, sex: 'Female', heightCm: 150, weightKg: 120 });
    expect(t.carbsG).toBeGreaterThanOrEqual(0);
  });
});
