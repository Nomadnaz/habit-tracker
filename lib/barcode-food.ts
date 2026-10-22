// ─────────────────────────────────────────────────────────────────────────
// Barcode → nutrition, via Open Food Facts (open database, ODbL; no key).
//
// The label numbers are kept per 100 g/ml, the way OFF and EU labels state
// them, and scaled to whatever portion you ate. A product's serving size is
// offered when the label gives one. Products already scanned are cached on
// the phone, so a rescan is instant and works offline.
// ─────────────────────────────────────────────────────────────────────────

export type Nutrition = { calories: number; proteinG: number; carbsG: number; fatG: number; sugarG: number };

export type FoodProduct = {
  code: string;
  name: string;
  brand: string | null;
  unit: 'g' | 'ml';
  per100: Nutrition;
  servingG: number | null;     // one serving, in `unit`
  servingLabel: string | null; // as printed, e.g. "1 bar (45 g)"
};

const KJ_PER_KCAL = 4.184;

const n = (v: unknown): number | null => {
  const x = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(x) && x >= 0 ? x : null;
};

/** One nutriment per 100 g: the _100g value, else derived from the per-serving one. */
function per100Of(nm: Record<string, unknown>, key: string, servingG: number | null): number | null {
  const direct = n(nm[`${key}_100g`]);
  if (direct != null) return direct;
  const perServing = n(nm[`${key}_serving`]);
  return perServing != null && servingG ? (perServing / servingG) * 100 : null;
}

/** OFF's product JSON → a FoodProduct, or null when it has no usable energy figure. */
export function parseProduct(code: string, p: Record<string, any> | null | undefined): FoodProduct | null {
  if (!p) return null;
  const nm = (p.nutriments ?? {}) as Record<string, unknown>;
  const servingG = n(p.serving_quantity) || null;
  let kcal = per100Of(nm, 'energy-kcal', servingG);
  if (kcal == null) {
    const kj = per100Of(nm, 'energy-kj', servingG) ?? per100Of(nm, 'energy', servingG);
    kcal = kj != null ? kj / KJ_PER_KCAL : null;
  }
  if (kcal == null) return null;
  const name = [p.product_name, p.product_name_en, p.generic_name].find(s => typeof s === 'string' && s.trim());
  const unitRaw = String(p.serving_quantity_unit ?? p.product_quantity_unit ?? '').toLowerCase();
  return {
    code,
    name: name ? String(name).trim() : 'Scanned food',
    brand: typeof p.brands === 'string' && p.brands.trim() ? p.brands.split(',')[0].trim() : null,
    unit: unitRaw === 'ml' ? 'ml' : 'g',
    per100: {
      calories: kcal,
      proteinG: per100Of(nm, 'proteins', servingG) ?? 0,
      carbsG: per100Of(nm, 'carbohydrates', servingG) ?? 0,
      fatG: per100Of(nm, 'fat', servingG) ?? 0,
      sugarG: per100Of(nm, 'sugars', servingG) ?? 0,
    },
    servingG,
    servingLabel: typeof p.serving_size === 'string' && p.serving_size.trim() ? p.serving_size.trim() : null,
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** The nutrition in `amount` g/ml of the product: kcal whole, grams to 0.1. */
export function portionOf(p: FoodProduct, amount: number): Nutrition {
  const f = Math.max(0, amount) / 100;
  return {
    calories: Math.round(p.per100.calories * f),
    proteinG: r1(p.per100.proteinG * f),
    carbsG: r1(p.per100.carbsG * f),
    fatG: r1(p.per100.fatG * f),
    sugarG: r1(p.per100.sugarG * f),
  };
}

const FIELDS = 'product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,product_quantity_unit';

/** 'found' with the product, 'missing' when OFF doesn't know it or has no
 *  nutrition for it, 'offline' when the lookup itself failed. */
export type Lookup = { status: 'found'; product: FoodProduct } | { status: 'missing' } | { status: 'offline' };

export async function fetchProduct(code: string, fetchFn: typeof fetch = fetch): Promise<Lookup> {
  try {
    const res = await fetchFn(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}?fields=${FIELDS}`, {
      headers: { 'User-Agent': 'Puck/1.0 (habit-tracker app)' },
    });
    if (res.status === 404) return { status: 'missing' };
    if (!res.ok) return { status: 'offline' };
    const json = await res.json();
    const product = json?.status === 1 ? parseProduct(code, json.product) : null;
    return product ? { status: 'found', product } : { status: 'missing' };
  } catch {
    return { status: 'offline' };
  }
}
