// TODAY's deck: which modules are slotted in, in what order. Local only.

import AsyncStorage from '@react-native-async-storage/async-storage';

export type ModuleId =
  | 'readiness' | 'train' | 'steps' | 'water' | 'fuel' | 'sleep'
  | 'muscles' | 'week' | 'goal' | 'log' | 'heart' | 'weight' | 'active' | 'macros';

/** wide = the full row; otherwise half. */
export const MODULES: Record<ModuleId, { word: string; wide: boolean }> = {
  readiness: { word: 'READINESS', wide: true },
  train: { word: 'SESSION', wide: true },
  steps: { word: 'STEPS', wide: false },
  water: { word: 'WATER', wide: false },
  fuel: { word: 'FUEL', wide: false },
  sleep: { word: 'SLEEP', wide: false },
  muscles: { word: 'MUSCLES', wide: true },
  week: { word: 'WEEK', wide: true },
  goal: { word: 'GOAL', wide: true },
  log: { word: 'TWIN LOG', wide: true },
  heart: { word: 'HEART', wide: false },
  weight: { word: 'WEIGHT', wide: false },
  active: { word: 'ACTIVE', wide: false },
  macros: { word: 'MACROS', wide: true },
};

export const ALL_MODULES = Object.keys(MODULES) as ModuleId[];
export const DEFAULT_DECK: ModuleId[] = ['readiness', 'steps', 'water', 'fuel', 'sleep', 'train', 'muscles', 'week', 'goal', 'log'];

const KEY = '@today_deck';

export async function getDeck(): Promise<ModuleId[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return (JSON.parse(raw) as string[]).filter((m): m is ModuleId => m in MODULES);
  } catch { /* fall through */ }
  return DEFAULT_DECK;
}

export async function saveDeck(deck: ModuleId[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(deck));
}

/** Rows for the grid: wide modules alone, halves in pairs. A half followed by
 *  a wide waits for the next half, so the grid never has a hole mid-way. */
export function packRows(deck: ModuleId[]): ModuleId[][] {
  const rows: ModuleId[][] = [];
  let open: ModuleId[] | null = null;
  for (const m of deck) {
    if (MODULES[m].wide) { rows.push([m]); continue; }
    if (open) { open.push(m); open = null; } else { open = [m]; rows.push(open); }
  }
  return rows;
}
