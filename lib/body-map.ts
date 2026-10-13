// ─────────────────────────────────────────────────────────────────────────
// Body map — the muscles on the BODY tab and the user's annotations on them.
//
// The figure itself is the 3D point cloud in lib/body-cloud.ts; its MUSCLES
// list (side-specific, e.g. 'quad.vm.l') is what gets annotated here.
//
// Annotations are local-only (AsyncStorage @body_map) — nothing server-side
// reads them yet, so there is no table and no sync.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MUSCLES, type Muscle } from '@/lib/body-cloud';

export type Region = Muscle;
export const REGIONS: Region[] = MUSCLES;
export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(REGIONS.map(r => [r.id, r]));

// Marks saved by the old flat front/back map (before 2026-10-14) used
// different ids; each carries over to the muscles that cover the same area.
const OLD_IDS: Record<string, string[]> = {
  head: ['head'], neck: ['neck'], nape: ['neck'],
  traps: ['traps.upper'], delt: ['delt.front'], rdelt: ['delt.rear'],
  chest: ['pec.upper', 'pec.lower'], bicep: ['biceps'], tricep: ['triceps.long', 'triceps.lat'],
  forearm: ['forearm.flex', 'forearm.ext'], hand: ['hand'], abs: ['abs.upper', 'abs.lower'],
  oblique: ['oblique'], hip: ['hipflex'], quad: ['quad.rf', 'quad.vl', 'quad.vm'],
  adductor: ['adductor'], knee: ['knee'], shin: ['tib', 'shin'], foot: ['foot'],
  upper: ['cuff', 'traps.mid'], lat: ['lat'], lower: ['erector'], glute: ['glute.max', 'glute.med'],
  ham: ['ham.bf', 'ham.st'], calf: ['gastro.lat', 'gastro.med'], heel: ['ankle'],
};

function migrate(marks: Record<string, Mark>): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const [id, mark] of Object.entries(marks)) {
    if (REGION_BY_ID[id]) { out[id] = mark; continue; }
    const m = /^(front|back)\.(\w+)(?:\.([lr]))?$/.exec(id);
    const targets = m && OLD_IDS[m[2]];
    if (!targets) continue;
    for (const t of targets) {
      const sides = REGION_BY_ID[t] ? [t] : m[3] ? [`${t}.${m[3]}`] : [`${t}.l`, `${t}.r`];
      for (const sid of sides) if (REGION_BY_ID[sid] && !out[sid]) out[sid] = mark;
    }
  }
  return out;
}

// ── annotations ──────────────────────────────────────────────────────────

export type Tone = 'hot' | 'signal' | 'live' | 'dim' | 'alert';
export interface Category { id: string; name: string; tone: Tone }
export interface Mark { category: string; note?: string }
export interface BodyMap { categories: Category[]; marks: Record<string, Mark> }

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'grow',     name: 'GROW',     tone: 'hot' },
  { id: 'strength', name: 'STRENGTH', tone: 'signal' },
  { id: 'mobility', name: 'MOBILITY', tone: 'live' },
  { id: 'recover',  name: 'RECOVER',  tone: 'dim' },
  { id: 'pain',     name: 'PAIN',     tone: 'alert' },
];

const KEY = '@body_map';

export async function loadBodyMap(): Promise<BodyMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw) as BodyMap;
      if (Array.isArray(m.categories) && m.marks) return { ...m, marks: migrate(m.marks) };
    }
  } catch { /* fall through to defaults */ }
  return { categories: DEFAULT_CATEGORIES, marks: {} };
}

export function saveBodyMap(m: BodyMap) {
  AsyncStorage.setItem(KEY, JSON.stringify(m)).catch(() => {});
}
