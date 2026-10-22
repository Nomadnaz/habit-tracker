import { describe, it, expect } from 'vitest';
import { parseProduct, portionOf, fetchProduct } from './barcode-food';

// Shapes as Open Food Facts returns them (trimmed to the fields we ask for).
const nutella = {
  product_name: 'Nutella', brands: 'Ferrero,Nutella', serving_size: '15 g', serving_quantity: '15',
  nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9, sugars_100g: 56.3 },
};

describe('barcode food', () => {
  it('reads per-100 g label values, serving and brand', () => {
    const p = parseProduct('3017620422003', nutella)!;
    expect(p.name).toBe('Nutella');
    expect(p.brand).toBe('Ferrero');
    expect(p.servingG).toBe(15);
    expect(p.per100.sugarG).toBe(56.3);
    expect(portionOf(p, 15)).toEqual({ calories: 81, proteinG: 0.9, carbsG: 8.6, fatG: 4.6, sugarG: 8.4 });
  });

  it('falls back to kJ, and derives per-100 from per-serving only labels', () => {
    const kj = parseProduct('1', { product_name: 'X', nutriments: { energy_100g: 418.4 } })!;
    expect(Math.round(kj.per100.calories)).toBe(100);
    const serv = parseProduct('2', {
      product_name: 'Cola can', serving_quantity: 330, serving_quantity_unit: 'ml',
      nutriments: { 'energy-kcal_serving': 139, sugars_serving: 35 },
    })!;
    expect(serv.unit).toBe('ml');
    expect(portionOf(serv, 330)).toMatchObject({ calories: 139, sugarG: 35 });
  });

  it('refuses a product with no energy figure', () => {
    expect(parseProduct('3', { product_name: 'Water?', nutriments: {} })).toBeNull();
    expect(parseProduct('4', null)).toBeNull();
  });

  it('maps the API outcomes', async () => {
    const ok = (body: unknown, status = 200) => (async () => ({ ok: status < 400, status, json: async () => body })) as unknown as typeof fetch;
    expect((await fetchProduct('3017620422003', ok({ status: 1, product: nutella }))).status).toBe('found');
    expect((await fetchProduct('0', ok({ status: 0 }))).status).toBe('missing');
    expect((await fetchProduct('0', ok({}, 404))).status).toBe('missing');
    expect((await fetchProduct('0', ok({}, 503))).status).toBe('offline');
    expect((await fetchProduct('0', (async () => { throw new Error('net'); }) as unknown as typeof fetch)).status).toBe('offline');
  });
});
