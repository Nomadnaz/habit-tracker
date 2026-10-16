// ─────────────────────────────────────────────────────────────────────────
// Lift sessions — the sets the puck measures, kept on the phone for the
// LIFT RECEIPT (app/lift-receipt.tsx).
//
// The server keeps one row per set (exercise_sets: totals only). The receipt
// wants more: every rep's height and speed, which the puck sends over BLE
// just ahead of each set as `set_reps` chunks (companion-hud screen_lift.c),
// and the sets of one exercise grouped into a session. That's local-only,
// like the rest of the app's caches; the last 30 sessions are kept.
//
// A set joins the open session for the same exercise if it lands within
// SESSION_GAP_MS of the last one; otherwise it starts a new session.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

export type LiftRep = { romCm: number; peakMps: number; meanMps: number; durMs: number };

export type LiftSet = {
  at: string;              // ISO, when the phone got it (the set's end)
  setMs: number | null;    // how long the set ran on the puck
  weightKg: number;
  reps: number;
  romCm: number | null;    // best rep
  peakMps: number | null;
  tempoS: number | null;   // mean rep duration
  repData: LiftRep[] | null; // null when the rep chunks didn't arrive (Wi-Fi path)
};

export type LiftSession = {
  id: string;
  exerciseId: string | null;
  name: string;
  date: string;            // YYYY-MM-DD
  sets: LiftSet[];
  photoUri?: string;       // optional proof photo
};

const KEY = '@lift_sessions';
const KEEP = 30;
export const SESSION_GAP_MS = 30 * 60 * 1000;

// ── pure ─────────────────────────────────────────────────────────────────

/** "34.1,0.82,0.61,1210;33.0,…" → reps. Malformed entries are skipped. */
export function parseReps(r: string): LiftRep[] {
  return r.split(';').flatMap(part => {
    const [rom, peak, mean, dur] = part.split(',').map(Number);
    return [rom, peak, mean, dur].every(Number.isFinite) ? [{ romCm: rom, peakMps: peak, meanMps: mean, durMs: dur }] : [];
  });
}

/** Collects one set's `set_reps` chunks; `take` returns the reps once all n have arrived. */
export class RepAssembler {
  private sets = new Map<number, { n: number; ms: number | null; reps: (LiftRep | undefined)[]; at: number }>();

  add(chunk: { set: number; i: number; n: number; ms?: number; r: string }) {
    let s = this.sets.get(chunk.set);
    if (!s) { s = { n: chunk.n, ms: Number.isFinite(chunk.ms) ? chunk.ms! : null, reps: [], at: Date.now() }; this.sets.set(chunk.set, s); }
    parseReps(chunk.r).forEach((rep, k) => { s!.reps[chunk.i + k] = rep; });
    // Anything older than a few minutes never got its log_set.
    for (const [id, v] of this.sets) if (Date.now() - v.at > 5 * 60_000) this.sets.delete(id);
  }

  take(set: number): { reps: LiftRep[] | null; ms: number | null } {
    const s = this.sets.get(set);
    this.sets.delete(set);
    if (!s) return { reps: null, ms: null };
    const reps = s.reps.slice(0, s.n);
    return { reps: reps.length === s.n && reps.every(Boolean) ? (reps as LiftRep[]) : null, ms: s.ms };
  }
}

/** Puts a set into the session it belongs to (or a new one); returns the new list and that session. */
export function placeSet(
  sessions: LiftSession[], set: LiftSet, name: string, exerciseId: string | null, date: string, newId: () => string,
): { sessions: LiftSession[]; session: LiftSession } {
  const key = name.trim().toUpperCase();
  const at = Date.parse(set.at);
  const open = sessions.find(s => s.name === key && s.date === date
    && at - Date.parse(s.sets[s.sets.length - 1]?.at ?? '') < SESSION_GAP_MS);
  const session: LiftSession = open
    ? { ...open, exerciseId: open.exerciseId ?? exerciseId, sets: [...open.sets, set] }
    : { id: newId(), exerciseId, name: key, date, sets: [set] };
  const rest = sessions.filter(s => s.id !== session.id);
  return { sessions: [session, ...rest].slice(0, KEEP), session };
}

export type SessionStats = {
  sets: number; reps: number; volumeKg: number; topKg: number; est1RmKg: number;
  bestRomCm: number | null; peakMps: number | null; tutS: number | null;
  /** First rep's peak speed vs the last rep's, of the last set — how much the set slowed. */
  velocityLossPct: number | null;
};

export function sessionStats(s: LiftSession): SessionStats {
  const reps = s.sets.reduce((a, x) => a + x.reps, 0);
  const allReps = s.sets.flatMap(x => x.repData ?? []);
  const last = s.sets[s.sets.length - 1]?.repData;
  const max = (xs: number[]) => (xs.length ? Math.max(...xs) : null);
  return {
    sets: s.sets.length,
    reps,
    volumeKg: s.sets.reduce((a, x) => a + x.weightKg * x.reps, 0),
    topKg: Math.max(0, ...s.sets.map(x => x.weightKg)),
    // Epley, same formula as exercise_sets.estimated_1rm_kg.
    est1RmKg: Math.max(0, ...s.sets.map(x => x.weightKg * (1 + x.reps / 30))),
    // The reps where they came through, else the set's own summary.
    bestRomCm: max(s.sets.flatMap(x => (x.repData ? x.repData.map(r => r.romCm) : x.romCm != null ? [x.romCm] : []))),
    peakMps: max(s.sets.flatMap(x => (x.repData ? x.repData.map(r => r.peakMps) : x.peakMps != null ? [x.peakMps] : []))),
    tutS: allReps.length ? allReps.reduce((a, r) => a + r.durMs, 0) / 1000 : null,
    velocityLossPct: last && last.length >= 2 && last[0].peakMps > 0
      ? Math.round((1 - last[last.length - 1].peakMps / last[0].peakMps) * 100) : null,
  };
}

/** When the first set started and the last one ended, ms. */
export function sessionSpan(s: LiftSession): { start: number; end: number } {
  const first = s.sets[0], last = s.sets[s.sets.length - 1];
  return { start: Date.parse(first.at) - (first.setMs ?? 0), end: Date.parse(last.at) };
}

// ── storage + live updates ───────────────────────────────────────────────

async function load(): Promise<LiftSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

/** 'set' = a new set landed in it; 'edit' = anything else (a photo). */
type Listener = (s: LiftSession, kind: 'set' | 'edit') => void;
const listeners = new Set<Listener>();

export function onLiftSession(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Which session's receipt is on screen, so a new set for it updates that
// receipt instead of opening another (lib/use-lift-receipts.ts).
let openReceipt: string | null = null;
export const setOpenReceipt = (id: string | null) => { openReceipt = id; };
export const getOpenReceipt = () => openReceipt;

export async function recordLiftSet(set: LiftSet, name: string, exerciseId: string | null, date: string): Promise<LiftSession> {
  const { sessions, session } = placeSet(await load(), set, name, exerciseId, date,
    () => `lift_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`);
  await AsyncStorage.setItem(KEY, JSON.stringify(sessions));
  listeners.forEach(fn => fn(session, 'set'));
  return session;
}

export async function getLiftSession(id: string): Promise<LiftSession | null> {
  return (await load()).find(s => s.id === id) ?? null;
}

export async function updateLiftSession(id: string, patch: Partial<Pick<LiftSession, 'photoUri'>>): Promise<LiftSession | null> {
  const all = await load();
  const i = all.findIndex(s => s.id === id);
  if (i < 0) return null;
  all[i] = { ...all[i], ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(all));
  listeners.forEach(fn => fn(all[i], 'edit'));
  return all[i];
}
