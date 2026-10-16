// ─────────────────────────────────────────────────────────────────────────
// Muscle recovery — which of the BODY tab's muscles an exercise works, and
// how recovered each muscle is from recent training, as a 0–100 "battery".
//
// Pure: sessions come in (lib/workout-data.ts getTrainingSessions), numbers
// go out. Ids here are muscle ids without the side ('quad.vl'); training is
// assumed bilateral, so both sides read the same.
//
// The model, deliberately simple:
//   · each session drains a muscle by depth = min(1, sets × share / 4)
//     (four full sets empties it; a secondary mover gets a fraction)
//   · it recharges linearly over the muscle's recovery time — 72h for big
//     movers, 48h medium, 36h small — stretched or shortened by volume
//   · drains from sessions close together stack
// ─────────────────────────────────────────────────────────────────────────

import type { MuscleGroup } from './workout-data';
import { toDateKey } from './dateKey';

export type Session = {
  exerciseId: string;
  name: string;
  muscleGroups: MuscleGroup[];
  date: string;       // YYYY-MM-DD
  at: number;         // ms — logged_at, or the evening of `date` for a done-log entry
  sets: number;
  weightKg: number;   // best set
  reps: number | null;
  measured: boolean;  // real logged sets (exercise_sets) vs. the template's plan
  /** How heavy it was for this lifter, 0.4–1 (withIntensity); unset counts as 1. */
  intensity?: number;
};

export type Hit = { session: Session; share: number };

export type MuscleStatus = {
  pct: number;              // 0–100
  readyAt: number | null;   // ms when it's back to 100, null if it already is
  lastAt: number | null;    // most recent session that worked it
  hits: Hit[];              // newest first
};

// Base recovery hours, for every muscle on the figure.
const BASE_H: Record<string, number> = {
  'quad.rf': 72, 'quad.vl': 72, 'quad.vm': 72, 'ham.bf': 72, 'ham.st': 72, 'glute.max': 72,
  erector: 72, lat: 72, 'pec.upper': 72, 'pec.lower': 72,
  'delt.front': 48, 'delt.side': 48, 'delt.rear': 48, 'traps.upper': 48, 'traps.mid': 48, 'traps.lower': 48,
  cuff: 48, biceps: 48, brachialis: 48, 'triceps.lat': 48, 'triceps.long': 48, adductor: 48,
  'glute.med': 48, hipflex: 48, serratus: 48, teres: 48, tfl: 48,
  brachiorad: 36, 'forearm.flex': 36, 'forearm.ext': 36, 'gastro.lat': 36, 'gastro.med': 36,
  soleus: 36, tib: 36, 'abs.upper': 36, 'abs.lower': 36, oblique: 36,
};

export const hasBattery = (baseId: string) => baseId in BASE_H;

/** 'quad.vl.l' → 'quad.vl'; 'abs.upper' stays. */
export const baseOf = (muscleId: string) => muscleId.replace(/\.[lr]$/, '');

type Share = Record<string, number>;
const TRI = { 'triceps.lat': 1, 'triceps.long': 1 };
const QUADS = { 'quad.rf': 1, 'quad.vl': 1, 'quad.vm': 1 };
const HAMS = { 'ham.bf': 1, 'ham.st': 1 };
const CALVES = { 'gastro.lat': 1, 'gastro.med': 1, soleus: 0.8 };
const scale = (s: Share, k: number): Share => Object.fromEntries(Object.entries(s).map(([m, v]) => [m, v * k]));

// Running and walking (cardioSessions below). Shares follow where a stride's
// work goes, from running/walking biomechanics (EMG and musculoskeletal
// models, e.g. Hamner & Delp 2010; Dorn et al. 2012): the calves, soleus
// most, give most of the support and push-off; the quads absorb each landing;
// glute med holds the pelvis level and glute max extends the hip; hamstrings
// brake the swinging leg; hip flexors swing it through; tibialis lowers the
// foot. Walking leans more on calves, tibialis and glute med, less on quads.
const RUN: Share = {
  soleus: 1, 'gastro.lat': 0.85, 'gastro.med': 0.85, 'quad.vl': 0.6, 'quad.vm': 0.6, 'quad.rf': 0.55,
  'glute.med': 0.5, 'glute.max': 0.45, 'ham.bf': 0.45, 'ham.st': 0.45, hipflex: 0.5, tib: 0.5, adductor: 0.25,
};
const WALK: Share = {
  soleus: 1, 'gastro.lat': 0.7, 'gastro.med': 0.7, tib: 0.6, 'glute.med': 0.6, 'quad.vl': 0.35, 'quad.vm': 0.35,
  'quad.rf': 0.3, 'glute.max': 0.35, 'ham.bf': 0.3, 'ham.st': 0.3, hipflex: 0.35, adductor: 0.2,
};

// Exercise name → muscles worked, first match wins. Checked before the
// coarse muscle-group fallback so "INCLINE DB PRESS" lands on the upper
// chest and "FACE PULL" on the rear delt rather than "chest" / "shoulders".
const RULES: [RegExp, Share][] = [
  [/LEG CURL|HAM(STRING)? CURL|NORDIC/, { ...HAMS, ...scale(CALVES, 0.3) }],
  [/LEG EXT/, QUADS],
  [/CALF/, CALVES],
  [/HAMMER/, { brachiorad: 1, brachialis: 1, biceps: 0.6, 'forearm.ext': 0.3 }],
  [/EXTERNAL ROT|INTERNAL ROT|CUBAN/, { cuff: 1, 'delt.rear': 0.3 }],
  [/\bY[ -]RAISE/, { 'traps.lower': 1, 'traps.mid': 0.6, 'delt.rear': 0.4 }],
  [/SERRATUS|SCAP(ULAR)? PUSH/, { serratus: 1, 'delt.front': 0.3 }],
  [/TIB(IALIS)? RAISE|TOE RAISE/, { tib: 1 }],
  [/KNEE RAISE|HIP FLEX/, { hipflex: 1, 'abs.lower': 0.6, tfl: 0.4 }],
  [/BACK EXT|HYPEREXT|SUPERMAN/, { erector: 1, 'glute.max': 0.5, ...scale(HAMS, 0.4) }],
  [/WRIST|FOREARM|GRIP/, { 'forearm.flex': 1, 'forearm.ext': 0.8, brachiorad: 0.5 }],
  [/CURL/, { biceps: 1, brachialis: 0.7, 'forearm.flex': 0.4 }],
  [/FACE PULL|REAR DELT|REVERSE (FLY|PEC)/, { 'delt.rear': 1, 'traps.mid': 0.7, cuff: 0.7, 'traps.lower': 0.3 }],
  [/\bDIPS?\b|DECLINE/, { 'pec.lower': 1, 'pec.upper': 0.3, ...scale(TRI, 0.7), 'delt.front': 0.4 }],
  [/PUSHDOWN|PUSH DOWN|TRICEP|SKULL|CLOSE GRIP|KICKBACK/, TRI],
  [/INCLINE/, { 'pec.upper': 1, 'pec.lower': 0.4, 'delt.front': 0.7, ...scale(TRI, 0.4) }],
  [/BENCH|CHEST PRESS|PUSH ?UP|PRESS UP/, { 'pec.lower': 1, 'pec.upper': 0.7, 'delt.front': 0.6, ...scale(TRI, 0.5) }],
  [/FLY|FLYE|PEC DECK|CROSSOVER/, { 'pec.lower': 1, 'pec.upper': 0.8, 'delt.front': 0.3 }],
  [/LATERAL|SIDE RAISE|UPRIGHT/, { 'delt.side': 1, 'traps.upper': 0.4, 'delt.front': 0.2 }],
  [/FRONT RAISE/, { 'delt.front': 1, 'pec.upper': 0.3 }],
  [/\bOHP\b|OVERHEAD|SHOULDER PRESS|MILITARY|ARNOLD/, { 'delt.front': 1, 'delt.side': 0.6, ...scale(TRI, 0.5), 'traps.upper': 0.3 }],
  [/SHRUG/, { 'traps.upper': 1, 'traps.mid': 0.4, 'forearm.flex': 0.3 }],
  [/PULL ?DOWN|PULL ?UP|\bCHIN(S|-?UPS?)?\b/, { lat: 1, teres: 0.7, biceps: 0.5, brachialis: 0.4, 'traps.lower': 0.5, 'delt.rear': 0.3 }],
  [/\bROWS?\b/, { lat: 0.8, 'traps.mid': 1, teres: 0.6, 'delt.rear': 0.6, 'traps.lower': 0.4, biceps: 0.4, erector: 0.3 }],
  [/ROMANIAN|RDL|STIFF|GOOD MORNING/, { ...HAMS, 'glute.max': 0.8, erector: 0.6 }],
  [/DEADLIFT/, { erector: 1, 'glute.max': 0.9, ...scale(HAMS, 0.7), 'quad.vl': 0.4, 'quad.vm': 0.4, 'traps.upper': 0.5, lat: 0.4, 'forearm.flex': 0.5 }],
  [/HIP THRUST|GLUTE BRIDGE|GLUTE KICK/, { 'glute.max': 1, 'glute.med': 0.5, ...scale(HAMS, 0.4) }],
  [/ABDUCT/, { 'glute.med': 1, tfl: 0.6 }],
  [/ADDUCT/, { adductor: 1 }],
  [/SQUAT|LEG PRESS|LUNGE|SPLIT|STEP ?UP|HACK/, { ...QUADS, 'quad.rf': 0.8, 'glute.max': 0.7, adductor: 0.5, ...scale(HAMS, 0.2) }],
  [/TWIST|WOODCHOP|SIDE PLANK/, { oblique: 1, 'abs.upper': 0.4 }],
  [/CRUNCH|SIT ?UP|PLANK|LEG RAISE|\bABS?\b/, { 'abs.upper': 1, 'abs.lower': 0.8, oblique: 0.4 }],
  // Last, so WALKING LUNGE stays a lunge.
  [/^ RUN $|\bRUNNING\b|\bJOG(GING)?\b|\bSPRINTS?\b/, RUN],
  [/^ WALKING $|\bHIKE\b|\bHIKING\b/, WALK],
];

const GROUPS: Record<MuscleGroup, Share> = {
  chest: { 'pec.upper': 1, 'pec.lower': 1 },
  back: { lat: 1, 'traps.mid': 0.8, 'traps.lower': 0.6, 'delt.rear': 0.4, erector: 0.3 },
  lats: { lat: 1, teres: 0.7 },
  'upper back': { 'traps.mid': 1, 'traps.lower': 0.8, cuff: 0.6, 'delt.rear': 0.6 },
  traps: { 'traps.upper': 1, 'traps.mid': 0.6 },
  shoulders: { 'delt.front': 1, 'delt.side': 1, 'delt.rear': 0.6 },
  biceps: { biceps: 1, brachialis: 0.7 },
  triceps: TRI,
  forearms: { brachiorad: 1, 'forearm.flex': 1, 'forearm.ext': 1 },
  quads: QUADS,
  hamstrings: HAMS,
  glutes: { 'glute.max': 1, 'glute.med': 0.6 },
  calves: CALVES,
  abs: { 'abs.upper': 1, 'abs.lower': 1 },
  'lower back': { erector: 1 },
  'hip flexors': { hipflex: 1, tfl: 0.6 },
  core: { 'abs.upper': 1, 'abs.lower': 1, oblique: 0.8, serratus: 0.5 },
  cardio: {},
};

/** Muscles (no side) an exercise works, each 0–1. */
export function musclesFor(name: string, groups: MuscleGroup[]): Share {
  const n = ` ${name.toUpperCase()} `;
  for (const [re, share] of RULES) if (re.test(n)) return share;
  // Fallback: the first listed group is the prime mover.
  const out: Share = {};
  groups.forEach((g, i) => {
    for (const [m, v] of Object.entries(GROUPS[g] ?? {})) out[m] = Math.max(out[m] ?? 0, v * (i === 0 ? 1 : 0.7));
  });
  return out;
}

// ── exercises for a muscle (the panel's GO list) ─────────────────────────

/** Common lifts, offered under RECOMMENDED. Names go through the same
 *  RULES as logged sessions; `groups` only matter where no rule matches. */
const CATALOGUE: [string, MuscleGroup[]][] = [
  ['BENCH PRESS', ['chest']], ['DUMBBELL BENCH PRESS', ['chest']], ['INCLINE DB PRESS', ['chest']],
  ['INCLINE BENCH PRESS', ['chest']], ['DECLINE BENCH PRESS', ['chest']], ['MACHINE CHEST PRESS', ['chest']],
  ['PUSH UP', ['chest']], ['CHEST DIPS', ['chest']], ['CABLE FLY', ['chest']], ['PEC DECK', ['chest']],
  ['OVERHEAD PRESS', ['shoulders']], ['SEATED DB SHOULDER PRESS', ['shoulders']], ['ARNOLD PRESS', ['shoulders']],
  ['LATERAL RAISE', ['shoulders']], ['CABLE LATERAL RAISE', ['shoulders']], ['UPRIGHT ROW', ['shoulders']],
  ['FRONT RAISE', ['shoulders']], ['REAR DELT FLY', ['shoulders']], ['FACE PULL', ['shoulders']],
  ['REVERSE PEC DECK', ['shoulders']], ['EXTERNAL ROTATION', ['upper back']], ['Y RAISE', ['upper back']],
  ['PULL UP', ['lats']], ['CHIN UP', ['lats']], ['LAT PULLDOWN', ['lats']], ['STRAIGHT ARM PULLDOWN', ['lats']],
  ['BARBELL ROW', ['back']], ['SEATED CABLE ROW', ['back']], ['CHEST SUPPORTED ROW', ['upper back']],
  ['SINGLE ARM DB ROW', ['back']], ['SHRUG', ['traps']], ['DEADLIFT', ['back']], ['BACK EXTENSION', ['lower back']],
  ['BARBELL CURL', ['biceps']], ['INCLINE DB CURL', ['biceps']], ['PREACHER CURL', ['biceps']], ['HAMMER CURL', ['biceps']],
  ['TRICEP PUSHDOWN', ['triceps']], ['OVERHEAD TRICEP EXTENSION', ['triceps']], ['SKULL CRUSHER', ['triceps']],
  ['CLOSE GRIP BENCH PRESS', ['triceps']], ['WRIST CURL', ['forearms']], ['REVERSE WRIST CURL', ['forearms']],
  ['FARMER CARRY', ['forearms', 'traps']],
  ['CABLE CRUNCH', ['abs']], ['HANGING LEG RAISE', ['abs']], ['AB WHEEL', ['abs']], ['PLANK', ['core']],
  ['RUSSIAN TWIST', ['core']], ['CABLE WOODCHOP', ['core']], ['SIDE PLANK', ['core']], ['SERRATUS PUNCH', ['core']],
  ['HANGING KNEE RAISE', ['hip flexors']],
  ['BACK SQUAT', ['quads']], ['FRONT SQUAT', ['quads']], ['HACK SQUAT', ['quads']], ['LEG PRESS', ['quads']],
  ['BULGARIAN SPLIT SQUAT', ['quads']], ['WALKING LUNGE', ['quads']], ['STEP UP', ['quads']], ['LEG EXTENSION', ['quads']],
  ['LYING LEG CURL', ['hamstrings']], ['SEATED LEG CURL', ['hamstrings']], ['NORDIC CURL', ['hamstrings']],
  ['ROMANIAN DEADLIFT', ['hamstrings']], ['GOOD MORNING', ['hamstrings']],
  ['HIP THRUST', ['glutes']], ['GLUTE BRIDGE', ['glutes']], ['HIP ABDUCTION', ['glutes']], ['HIP ADDUCTION', ['glutes']],
  ['STANDING CALF RAISE', ['calves']], ['SEATED CALF RAISE', ['calves']], ['TIBIALIS RAISE', ['calves']],
];

export type RecentExercise = Hit & { times: number };
export type Suggestion = { name: string; share: number; mine: boolean };

/** One row per exercise — its latest session, and how many in the window. */
export function byExercise(hits: Hit[]): RecentExercise[] {
  const out: RecentExercise[] = [];
  for (const h of hits) {
    const row = out.find(r => r.session.exerciseId === h.session.exerciseId);
    if (row) row.times++;
    else out.push({ ...h, times: 1 });
  }
  return out;
}

/** What else works `baseId`: the user's own exercises and the catalogue,
 *  minus what they've done recently, best fit first. */
export function suggestionsFor(baseId: string, recent: Hit[], library: { name: string; muscleGroups: MuscleGroup[] }[]): Suggestion[] {
  const seen = new Set(recent.map(h => h.session.name.toUpperCase()));
  const out: Suggestion[] = [];
  const add = (name: string, groups: MuscleGroup[], mine: boolean) => {
    const key = name.toUpperCase();
    if (seen.has(key)) return;
    seen.add(key);
    const share = musclesFor(name, groups)[baseId] ?? 0;
    if (share >= 0.3) out.push({ name, share, mine });
  };
  for (const e of library) add(e.name, e.muscleGroups, true);
  for (const [name, groups] of CATALOGUE) add(name, groups, false);
  return out.sort((a, b) => b.share - a.share || Number(b.mine) - Number(a.mine));
}

const H = 3_600_000;

export function muscleStatus(baseId: string, sessions: Session[], now: number): MuscleStatus {
  const base = BASE_H[baseId];
  const hits: Hit[] = [];
  let drained = 0;
  let readyAt: number | null = null;
  for (const s of sessions) {
    const share = musclesFor(s.name, s.muscleGroups)[baseId] ?? 0;
    if (share <= 0 || s.at > now) continue;
    hits.push({ session: s, share });
    if (!base) continue;
    const stim = s.sets * share * (s.intensity ?? 1);
    const need = base * Math.min(1.3, Math.max(0.6, 0.6 + stim / 8)) * H;
    const left = 1 - (now - s.at) / need;
    if (left <= 0) continue;
    drained += Math.min(1, stim / 4) * left;
    readyAt = Math.max(readyAt ?? 0, s.at + need);
  }
  hits.sort((a, b) => b.session.at - a.session.at);
  return {
    pct: Math.round(100 * (1 - Math.min(1, drained))),
    readyAt,
    lastAt: hits[0]?.session.at ?? null,
    hits,
  };
}

// ── how heavy, and what running/walking cost ─────────────────────────────

const e1rm = (s: Session) => (s.weightKg > 0 ? s.weightKg * (1 + (s.reps ?? 1) / 30) : 0);

/** Marks each lift with how heavy it was for this lifter: its estimated 1RM
 *  against their best for that exercise in the same sessions. A light day
 *  drains less than a heavy one. Lifts without a weight stay at 1. */
export function withIntensity(sessions: Session[]): Session[] {
  const best = new Map<string, number>();
  for (const s of sessions) best.set(s.exerciseId, Math.max(best.get(s.exerciseId) ?? 0, e1rm(s)));
  return sessions.map(s => {
    const b = best.get(s.exerciseId) ?? 0, v = e1rm(s);
    return v > 0 && b > 0 ? { ...s, intensity: Math.max(0.4, v / b) } : s;
  });
}

export type Run = { start: number; end: number; distanceM: number };

// Steps as training. A run's steps come from its distance; walking is the
// day's steps minus any run, and only what's past an ordinary day counts.
// Calibrated so a 5 km run (~4,300 steps) takes about half the calves'
// battery and a half marathon empties calves and quads for 2–4 days; a
// 20k-step day of walking costs the calves about a fifth.
const STEP_M = 1.15;            // metres per running step, recreational pace
const RUN_SETS_PER_1K = 0.5;    // 1,000 running steps ≈ half a hard set for the prime movers
const WALK_FREE = 7500;         // everyday walking below this costs nothing
const WALK_SETS_PER_1K = 0.06;

export const runSteps = (r: Run) => r.distanceM / STEP_M;

/** Runs (watch or in-app; overlapping ones counted once) and heavy walking days, as sessions. */
export function cardioSessions(steps: Record<string, number>, runs: Run[], now: number, days = 7): Session[] {
  const since = now - days * 86_400_000;
  const kept: Run[] = [];
  for (const r of [...runs].sort((a, b) => b.distanceM - a.distanceM)) {
    if (r.end < since || r.distanceM <= 0 || r.start > now) continue;
    if (!kept.some(k => r.start < k.end && k.start < r.end)) kept.push(r);
  }
  const out: Session[] = kept.map(r => ({
    exerciseId: `run:${r.start}`, name: 'RUN', muscleGroups: [], date: toDateKey(new Date(r.end)), at: r.end,
    sets: (runSteps(r) / 1000) * RUN_SETS_PER_1K, weightKg: 0, reps: null, measured: true,
  }));
  for (let d = 0; d < days; d++) {
    const day = new Date(now - d * 86_400_000);
    const key = toDateKey(day);
    const ran = kept.filter(r => toDateKey(new Date(r.end)) === key).reduce((a, r) => a + runSteps(r), 0);
    const extra = (steps[key] ?? 0) - ran - WALK_FREE;
    if (extra <= 0) continue;
    const evening = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 20).getTime();
    out.push({
      exerciseId: `walk:${key}`, name: 'WALKING', muscleGroups: [], date: key, at: Math.min(now, evening),
      sets: (extra / 1000) * WALK_SETS_PER_1K, weightKg: 0, reps: null, measured: true,
    });
  }
  return out;
}

// ── the BODY tab's lenses ────────────────────────────────────────────────

const isWalk = (s: Session) => s.name === 'WALKING';

/** How hard a set of lifts hits each muscle, 0–1 — the same drain the battery takes. */
export function loadOf(items: { name: string; muscleGroups: MuscleGroup[]; sets: number; intensity?: number }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items) {
    for (const [m, share] of Object.entries(musclesFor(it.name, it.muscleGroups))) {
      out[m] = Math.min(1, (out[m] ?? 0) + Math.min(1, (it.sets * share * (it.intensity ?? 1)) / 4));
    }
  }
  return out;
}

/** The most recent day you trained (walking doesn't count) and what it took out of each muscle. */
export function lastDay(sessions: Session[]): { date: string | null; names: string[]; load: Record<string, number> } {
  const date = sessions.filter(s => !isWalk(s)).reduce<string | null>((d, s) => (!d || s.date > d ? s.date : d), null);
  const day = sessions.filter(s => s.date === date && !isWalk(s));
  return { date, names: [...new Set(day.map(s => s.name))], load: loadOf(day) };
}

/** Days since each muscle was last worked (walking doesn't count); null = not in these sessions. */
export function daysSince(sessions: Session[], now: number): Record<string, number | null> {
  const out: Record<string, number | null> = Object.fromEntries(Object.keys(BASE_H).map(m => [m, null]));
  for (const s of sessions) {
    if (isWalk(s) || s.at > now) continue;
    for (const [m, share] of Object.entries(musclesFor(s.name, s.muscleGroups))) {
      if (share < 0.3 || !(m in out)) continue;
      const d = (now - s.at) / 86_400_000;
      out[m] = out[m] == null ? d : Math.min(out[m]!, d);
    }
  }
  return out;
}

export const RECOVERY_MUSCLES = Object.keys(BASE_H);
