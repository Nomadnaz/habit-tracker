// ─────────────────────────────────────────────────────────────────────────
// BODY's readouts: the day's modules (steps, water, fuel, sleep, heart…)
// hang in slots either side of the figure, each with a line to a point on
// the body that you choose. This is the layout: which module sits in which
// slot, and where its line goes. Local only (@body_hud).
//
// Slots 0–4 run down the left of the stage, 5–9 down the right. A point
// is in the figure's own space (cm, +x = the body's left, +z = its front)
// with the surface's normal there, so its line can fade while it's round
// the back. Modules left off the figure are listed under it instead.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export type V3 = [number, number, number];

export type HudModule =
  | 'readiness' | 'train' | 'steps' | 'water' | 'fuel' | 'sleep' | 'muscles'
  | 'week' | 'goal' | 'log' | 'heart' | 'weight' | 'active' | 'macros' | 'mood';

/** Name, and the line the picker shows under it. */
export const MODULES: Record<HudModule, { word: string; blurb: string }> = {
  readiness: { word: 'READINESS', blurb: 'HRV, sleep, heart, load' },
  train: { word: 'SESSION', blurb: "Today's workout" },
  steps: { word: 'STEPS', blurb: 'Against the twin’s target' },
  water: { word: 'WATER', blurb: 'Millilitres today' },
  fuel: { word: 'FUEL', blurb: 'Calories today' },
  sleep: { word: 'SLEEP', blurb: 'Last night, and bedtime' },
  muscles: { word: 'MUSCLES', blurb: 'How many are recovered' },
  week: { word: 'WEEK', blurb: 'Sessions this week' },
  goal: { word: 'GOAL', blurb: 'Where your goal is heading' },
  log: { word: 'TWIN LOG', blurb: 'What the twin picked up' },
  heart: { word: 'HEART', blurb: 'Heart rate and HRV' },
  weight: { word: 'WEIGHT', blurb: 'Latest weigh-in' },
  active: { word: 'ACTIVE', blurb: 'Active calories' },
  macros: { word: 'MACROS', blurb: 'Protein, carbs, fat, sugar' },
  mood: { word: 'MOOD', blurb: "Today's check-in" },
};
export const ALL_MODULES = Object.keys(MODULES) as HudModule[];

export const ROWS = 5;
export const SLOTS = ROWS * 2;
export const slotSide = (slot: number): 'l' | 'r' => (slot < ROWS ? 'l' : 'r');
export const slotRow = (slot: number) => slot % ROWS;

export type Spot = { at: V3; n: V3 | null };
export type Pin = Spot & { id: HudModule; slot: number };

/** Where each module's line goes until you move it: points on the figure's
 *  surface, found by casting into the mesh from the front (lib/body-hud.test.ts
 *  checks they still land on it). Feet have no normal — seen from any side. */
export const HOME_SPOT: Record<HudModule, Spot> = {
  readiness: { at: [-9, 136, 7], n: [-0.3, 0.7, 0.7] },   // right chest
  heart: { at: [8, 133, 9.6], n: [0.2, 0.7, 0.7] },       // left chest
  fuel: { at: [-3, 114, 11.6], n: [0.3, 0.1, 0.9] },      // upper abs
  macros: { at: [3, 96, 9.4], n: [-0.2, -0.1, 1] },       // lower abs
  water: { at: [-12, 106, 2.6], n: [-0.9, -0.3, 0.2] },   // right oblique
  steps: { at: [-9, 3, 9.2], n: null },                   // right foot
  sleep: { at: [3, 163, 8.7], n: [0.5, 0, 0.8] },         // head
  train: { at: [19, 121, 0.6], n: [0.1, 0, 1] },          // left bicep
  muscles: { at: [11, 64, 5.8], n: [0, -0.1, 1] },        // left thigh
  week: { at: [23, 96, 1.9], n: [-0.2, 0.1, 1] },         // left forearm
  active: { at: [-11, 58, 4.8], n: [-0.5, -0.3, 0.8] },   // right thigh
  weight: { at: [-6, 90, 3.1], n: [0.8, 0.4, 0.5] },      // right hip
  mood: { at: [-4, 160, 7.6], n: [-0.2, -0.4, 0.9] },     // face
  goal: { at: [-2, 150, 7.9], n: [-0.2, -0.5, 0.8] },     // neck
  log: { at: [1, 166, 8.3], n: [0.2, 0.4, 0.9] },         // forehead
};

const pin = (id: HudModule, slot: number): Pin => ({ id, slot, ...HOME_SPOT[id] });

/** Left: readiness, fuel, water, macros, steps. Right: sleep, heart, session, muscles, week. */
export const DEFAULT_PINS: Pin[] = [
  pin('readiness', 0), pin('fuel', 1), pin('water', 2), pin('macros', 3), pin('steps', 4),
  pin('sleep', 5), pin('heart', 6), pin('train', 7), pin('muscles', 8), pin('week', 9),
];

export const pinIn = (pins: Pin[], slot: number) => pins.find(p => p.slot === slot) ?? null;
export const freeSlots = (pins: Pin[]) => Array.from({ length: SLOTS }, (_, s) => s).filter(s => !pinIn(pins, s));
/** Modules not on the figure, in picker order. */
export const offBody = (pins: Pin[]) => ALL_MODULES.filter(m => !pins.some(p => p.id === m));

/** Put a module in a slot with its line at `spot`. Already on the figure →
 *  it moves (and whatever had the slot swaps into its old one); new → it
 *  takes the slot and whatever was there comes off. */
export function place(pins: Pin[], id: HudModule, slot: number, spot: Spot): Pin[] {
  const mine = pins.find(p => p.id === id);
  const there = pinIn(pins, slot);
  const rest = pins.filter(p => p.id !== id && p !== there);
  const next: Pin[] = [...rest, { id, slot, at: spot.at, n: spot.n }];
  if (there && there.id !== id && mine) next.push({ ...there, slot: mine.slot });
  return next.sort((a, b) => a.slot - b.slot);
}

/** Move a module to another slot, swapping with whatever is there. */
export function move(pins: Pin[], id: HudModule, slot: number): Pin[] {
  const mine = pins.find(p => p.id === id);
  if (!mine || mine.slot === slot) return pins;
  return place(pins, id, slot, mine);
}

/** Run a module's line to a new point. */
export const repoint = (pins: Pin[], id: HudModule, spot: Spot): Pin[] =>
  pins.map(p => (p.id === id ? { ...p, at: spot.at, n: spot.n } : p));

/** Swap which module a slot shows, keeping the slot and the line. A module
 *  that was already elsewhere on the figure trades places with it. */
export function swapModule(pins: Pin[], id: HudModule, next: HudModule): Pin[] {
  const mine = pins.find(p => p.id === id);
  if (!mine || id === next) return pins;
  const other = pins.find(p => p.id === next);
  return pins.map(p => (p === mine ? { ...p, id: next } : p === other ? { ...p, id } : p));
}

export const remove = (pins: Pin[], id: HudModule): Pin[] => pins.filter(p => p.id !== id);

const isV3 = (v: unknown): v is V3 => Array.isArray(v) && v.length === 3 && v.every(x => typeof x === 'number' && Number.isFinite(x));

/** Keeps only well-formed pins: known modules, real slots, one each. */
export function sanitize(raw: unknown): Pin[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Pin[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const { id, slot, at, n } = r as Record<string, unknown>;
    if (typeof id !== 'string' || !(id in MODULES)) continue;
    if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 0 || slot >= SLOTS) continue;
    if (!isV3(at) || (n !== null && !isV3(n))) continue;
    if (out.some(p => p.id === id || p.slot === slot)) continue;
    out.push({ id: id as HudModule, slot, at, n: n as V3 | null });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

const KEY = '@body_hud';

export async function getPins(): Promise<Pin[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const pins = raw ? sanitize(JSON.parse(raw)) : null;
    if (pins) return pins;
  } catch { /* fall through */ }
  return DEFAULT_PINS;
}

export async function savePins(pins: Pin[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(pins));
}
