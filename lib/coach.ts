// ─────────────────────────────────────────────────────────────────────────
// Coach — what to train today. Pure: a routine, recent training and the
// wearable's numbers come in, a session focus and the reasons for it go out.
//
//   ROUTINE   how many days a week, and which. The split follows the count
//             so each muscle gets worked about twice a week (the frequency
//             with the best evidence for growth, Schoenfeld et al. 2016):
//               1–3 days  FULL BODY every time
//               4 days    UPPER / LOWER
//               5 days    UPPER / LOWER / PUSH / PULL / LEGS
//               6 days    PUSH / PULL / LEGS twice
//               7 days    PPL twice + a CORE day
//             The weekdays say WHEN you train; the rotation says WHAT. Miss
//             a day and the rotation waits for you instead of skipping it.
//
//   READINESS 0–100 from last night against your own baseline:
//               HRV        35%  vs your 30-day mean (low = stressed/under-recovered)
//               resting HR 20%  vs your 30-day mean (high = same)
//               sleep      30%  hours asleep against 8
//               load       15%  how drained the muscles are (lib/muscle-recovery.ts)
//             Missing inputs drop out and the rest are reweighted. A breathing
//             rate well above baseline (an early sign of getting ill) caps it at 45.
//
//   TODAY     the next focus in the rotation, unless its muscles are still
//             tired (<70%) and another focus in the split is clearly fresher
//             — then they swap. Readiness sets the dose: PUSH, TRAIN, EASY
//             (a set less, stop two reps short) or RECOVER (core + mobility).
// ─────────────────────────────────────────────────────────────────────────

import { CATALOGUE, muscleStatus, musclesFor, RECOVERY_MUSCLES, type Session } from './muscle-recovery';
import { toDateKey } from './dateKey';
import type { Focus, GymPlan, MuscleGroup, PlanDayValue } from './workout-data';

export type Weekday = keyof GymPlan;
export type SplitId = 'auto' | 'full' | 'ul' | 'ppl' | 'hybrid';
export type Routine = { days: Weekday[]; split: SplitId };

export const WEEK: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DOW: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export const FOCI: Focus[] = ['push', 'pull', 'legs', 'upper', 'lower', 'full', 'core'];

export const FOCUS_TITLE: Record<Focus, string> = {
  push: 'PUSH DAY', pull: 'PULL DAY', legs: 'LEG DAY', upper: 'UPPER BODY', lower: 'LOWER BODY', full: 'FULL BODY', core: 'CORE DAY',
};

// How much each muscle (lib/muscle-recovery.ts ids) matters to a focus.
const PUSH = { 'pec.upper': 1, 'pec.lower': 1, 'delt.front': 1, 'delt.side': 0.8, 'triceps.lat': 0.8, 'triceps.long': 0.8, serratus: 0.3 };
const PULL = {
  lat: 1, 'traps.mid': 0.9, 'delt.rear': 0.8, biceps: 0.8, teres: 0.7, brachialis: 0.6, 'traps.lower': 0.6,
  brachiorad: 0.5, cuff: 0.4, 'traps.upper': 0.4, 'forearm.flex': 0.3,
};
const LEGS = {
  'quad.rf': 1, 'quad.vl': 1, 'quad.vm': 1, 'glute.max': 0.9, 'ham.bf': 0.9, 'ham.st': 0.9, adductor: 0.5,
  'glute.med': 0.5, 'gastro.lat': 0.6, 'gastro.med': 0.6, soleus: 0.6, erector: 0.4,
};
const CORE = { 'abs.upper': 1, 'abs.lower': 1, oblique: 1, erector: 0.6, hipflex: 0.5, serratus: 0.5 };
const scale = (s: Record<string, number>, k: number) => Object.fromEntries(Object.entries(s).map(([m, v]) => [m, v * k]));

export const FOCUS_MUSCLES: Record<Focus, Record<string, number>> = {
  push: PUSH,
  pull: PULL,
  legs: LEGS,
  upper: { ...scale(PULL, 0.9), ...scale(PUSH, 0.9) },
  lower: { ...LEGS, ...scale(CORE, 0.4) },
  full: {
    'pec.upper': 0.7, 'pec.lower': 0.7, lat: 0.7, 'traps.mid': 0.5, 'delt.front': 0.5,
    'quad.rf': 0.8, 'quad.vl': 0.8, 'quad.vm': 0.8, 'glute.max': 0.7, 'ham.bf': 0.6, 'ham.st': 0.6, 'abs.upper': 0.3,
  },
  core: CORE,
};

/** The lifts a focus starts with when you've no template for it yet (names from CATALOGUE). */
export const FOCUS_LINEUP: Record<Focus, string[]> = {
  push: ['BENCH PRESS', 'INCLINE DB PRESS', 'OVERHEAD PRESS', 'LATERAL RAISE', 'TRICEP PUSHDOWN'],
  pull: ['LAT PULLDOWN', 'SEATED CABLE ROW', 'FACE PULL', 'BARBELL CURL', 'HAMMER CURL'],
  legs: ['BACK SQUAT', 'ROMANIAN DEADLIFT', 'LEG PRESS', 'LYING LEG CURL', 'STANDING CALF RAISE'],
  upper: ['BENCH PRESS', 'BARBELL ROW', 'OVERHEAD PRESS', 'LAT PULLDOWN', 'BARBELL CURL', 'TRICEP PUSHDOWN'],
  lower: ['BACK SQUAT', 'ROMANIAN DEADLIFT', 'BULGARIAN SPLIT SQUAT', 'SEATED LEG CURL', 'STANDING CALF RAISE', 'HANGING LEG RAISE'],
  full: ['BACK SQUAT', 'BENCH PRESS', 'BARBELL ROW', 'ROMANIAN DEADLIFT', 'OVERHEAD PRESS', 'PLANK'],
  core: ['CABLE CRUNCH', 'HANGING LEG RAISE', 'CABLE WOODCHOP', 'SIDE PLANK', 'BACK EXTENSION'],
};

/** "PUSH DAY" → push, "LEGS DAY" → legs; null for a name that isn't a focus ("ARMS"). */
export function focusOfName(name: string): Focus | null {
  const n = name.toUpperCase();
  if (/\bPUSH\b/.test(n)) return 'push';
  if (/\bPULL\b/.test(n)) return 'pull';
  if (/\bUPPER\b/.test(n)) return 'upper';
  if (/\bLOWER\b/.test(n)) return 'lower';
  if (/\bLEGS?\b/.test(n)) return 'legs';
  if (/\bFULL\b/.test(n)) return 'full';
  if (/\bCORE\b|\bABS\b/.test(n)) return 'core';
  return null;
}

// ── routine → split → week ───────────────────────────────────────────────

export const SPLIT_NAME: Record<Exclude<SplitId, 'auto'>, string> = {
  full: 'FULL BODY', ul: 'UPPER - LOWER', ppl: 'PUSH PULL LEGS', hybrid: 'UPPER LOWER PPL',
};
const SPLITS: Record<Exclude<SplitId, 'auto'>, Focus[]> = {
  full: ['full'], ul: ['upper', 'lower'], ppl: ['push', 'pull', 'legs'], hybrid: ['upper', 'lower', 'push', 'pull', 'legs'],
};

export function autoSplit(daysPerWeek: number): Exclude<SplitId, 'auto'> {
  if (daysPerWeek <= 3) return 'full';
  if (daysPerWeek === 4) return 'ul';
  if (daysPerWeek === 5) return 'hybrid';
  return 'ppl';
}

export function splitOf(r: Routine): Exclude<SplitId, 'auto'> {
  return r.split === 'auto' ? autoSplit(r.days.length) : r.split;
}

/** The order sessions come round in. */
export function rotation(r: Routine): Focus[] {
  const base = SPLITS[splitOf(r)];
  return r.split === 'auto' && r.days.length >= 7 ? [...base, ...base, 'core'] : base;
}

/** Spread n training days over the week, as evenly as the week allows. */
export function defaultDays(n: number): Weekday[] {
  const picks: Record<number, number[]> = {
    1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6],
  };
  return (picks[Math.max(1, Math.min(7, n))] ?? []).map(i => WEEK[i]);
}

/** A week on paper: the rotation dealt onto the chosen days, Monday first. Rest elsewhere. */
export function weekPlan(r: Routine): GymPlan {
  const rot = rotation(r);
  const chosen = WEEK.filter(d => r.days.includes(d));
  const plan = Object.fromEntries(WEEK.map(d => [d, 'rest' as PlanDayValue])) as GymPlan;
  chosen.forEach((d, i) => { plan[d] = rot[i % rot.length]; });
  return plan;
}

// ── recovery per focus ───────────────────────────────────────────────────

/** How recovered a focus's muscles are, 0–100, weighted by how much each matters. */
export function freshness(focus: Focus, sessions: Session[], now: number): number {
  let sum = 0, w = 0;
  for (const [m, k] of Object.entries(FOCUS_MUSCLES[focus])) {
    sum += muscleStatus(m, sessions, now).pct * k;
    w += k;
  }
  return w ? Math.round(sum / w) : 100;
}

/** The focus's most tired important muscle. */
function weakest(focus: Focus, sessions: Session[], now: number): { id: string; pct: number } {
  let best = { id: '', pct: 101 };
  for (const [m, k] of Object.entries(FOCUS_MUSCLES[focus])) {
    if (k < 0.8) continue;
    const pct = muscleStatus(m, sessions, now).pct;
    if (pct < best.pct) best = { id: m, pct };
  }
  return best;
}

const MUSCLE_WORD: Record<string, string> = {
  'pec.upper': 'UPPER CHEST', 'pec.lower': 'CHEST', 'delt.front': 'FRONT DELTS', 'delt.side': 'SIDE DELTS',
  'triceps.lat': 'TRICEPS', 'triceps.long': 'TRICEPS', lat: 'LATS', 'traps.mid': 'MID BACK', 'delt.rear': 'REAR DELTS',
  biceps: 'BICEPS', 'quad.rf': 'QUADS', 'quad.vl': 'QUADS', 'quad.vm': 'QUADS', 'glute.max': 'GLUTES',
  'ham.bf': 'HAMSTRINGS', 'ham.st': 'HAMSTRINGS', 'abs.upper': 'ABS', 'abs.lower': 'ABS', oblique: 'OBLIQUES',
  'gastro.lat': 'CALVES', 'gastro.med': 'CALVES', soleus: 'CALVES', tib: 'SHINS', erector: 'LOWER BACK', hipflex: 'HIP FLEXORS',
};
export const muscleWord = (id: string) => MUSCLE_WORD[id] ?? id.split('.')[0].toUpperCase();

// ── readiness ────────────────────────────────────────────────────────────

export type Night = { asleep: number; deep: number; rem: number; awake: number };

/** Daily numbers from a wearable (through Apple Health), keyed YYYY-MM-DD. */
export type Vitals = {
  hrv: Record<string, number>;     // ms, that day's mean
  rhr: Record<string, number>;     // bpm
  resp: Record<string, number>;    // breaths/min while asleep
  sleep: Record<string, Night>;    // minutes, the night ending that morning
  spo2: number | null;             // %, latest
  sources: Partial<Record<'hrv' | 'rhr' | 'sleep' | 'resp', string>>;
};

export type FactorId = 'hrv' | 'rhr' | 'sleep' | 'load';
export type Factor = { id: FactorId; label: string; value: string; score: number; note: string };
export type Level = 'push' | 'train' | 'easy' | 'recover';
export type Readiness = { score: number; level: Level; factors: Factor[]; flags: string[] };

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const WEIGHT: Record<FactorId, number> = { hrv: 0.35, rhr: 0.2, sleep: 0.3, load: 0.15 };

/** Today's reading (or yesterday's, if today's hasn't landed) against the 30 days before it. */
function vsBaseline(series: Record<string, number>, today: Date): { now: number; mean: number; sd: number } | null {
  const key = (d: number) => toDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - d));
  const back = series[key(0)] != null ? 0 : series[key(1)] != null ? 1 : -1;
  if (back < 0) return null;
  const prior: number[] = [];
  for (let d = back + 1; d <= back + 30; d++) if (series[key(d)] != null) prior.push(series[key(d)]);
  if (prior.length < 4) return null;
  const mean = prior.reduce((a, b) => a + b, 0) / prior.length;
  const sd = Math.sqrt(prior.reduce((a, b) => a + (b - mean) ** 2, 0) / prior.length);
  return { now: series[key(back)], mean, sd };
}

/** Average drain across all muscles, bigger muscles counting more (0 fresh – 1 empty). */
export function systemicLoad(sessions: Session[], now: number): number {
  let sum = 0;
  for (const m of RECOVERY_MUSCLES) sum += 1 - muscleStatus(m, sessions, now).pct / 100;
  return sum / RECOVERY_MUSCLES.length;
}

export function readiness(v: Vitals | null | undefined, load: number, today: Date): Readiness {
  const factors: Factor[] = [];
  const flags: string[] = [];
  const signed = (x: number, unit: string) => `${x >= 0 ? '+' : ''}${Math.round(x)}${unit}`;

  const hrv = v && vsBaseline(v.hrv, today);
  if (hrv) {
    const z = (hrv.now - hrv.mean) / Math.max(hrv.sd, hrv.mean * 0.05);
    factors.push({
      id: 'hrv', label: 'HRV', value: `${Math.round(hrv.now)}`, score: clamp(60 + 20 * z),
      note: z <= -1 ? `${signed(hrv.now - hrv.mean, 'ms')} vs usual — body under stress` : z >= 1 ? `${signed(hrv.now - hrv.mean, 'ms')} vs usual — well recovered` : 'In your normal range',
    });
  }
  const rhr = v && vsBaseline(v.rhr, today);
  if (rhr) {
    const z = (rhr.now - rhr.mean) / Math.max(rhr.sd, 1.5);
    factors.push({
      id: 'rhr', label: 'RESTING HR', value: `${Math.round(rhr.now)}`, score: clamp(60 - 20 * z),
      note: z >= 1 ? `${signed(rhr.now - rhr.mean, ' bpm')} vs usual` : z <= -1 ? `${signed(rhr.now - rhr.mean, ' bpm')} vs usual — good sign` : 'In your normal range',
    });
  }
  const lastNight = v?.sleep[toDateKey(today)];
  if (lastNight && lastNight.asleep > 0) {
    const h = lastNight.asleep / 60;
    factors.push({
      id: 'sleep', label: 'SLEEP', value: `${Math.floor(h)}H${String(Math.round((h % 1) * 60)).padStart(2, '0')}`,
      score: clamp(((lastNight.asleep - 240) / 240) * 100),
      note: h < 6 ? 'Short night — recovery is slower' : h >= 7.5 ? 'Full night' : 'A little under 8 hours',
    });
  }
  factors.push({
    id: 'load', label: 'MUSCLE LOAD', value: `${Math.round(load * 100)}`, score: clamp(100 - load * 160),
    note: load > 0.35 ? 'A lot of muscle still recovering' : load > 0.15 ? 'Some muscles still recovering' : 'Muscles mostly fresh',
  });

  const w = factors.reduce((a, f) => a + WEIGHT[f.id], 0);
  let score = Math.round(factors.reduce((a, f) => a + f.score * WEIGHT[f.id], 0) / w);

  const resp = v && vsBaseline(v.resp, today);
  if (resp && resp.now - resp.mean >= 1.5) {
    score = Math.min(score, 45);
    flags.push('Breathing rate is up overnight — an early sign of getting ill. Keep it light.');
  }
  if (factors.length === 1) flags.push('Only training load counted. Connect a wearable in Settings for HRV and sleep.');

  let level: Level = score >= 75 ? 'push' : score >= 55 ? 'train' : score >= 38 ? 'easy' : 'recover';
  // Fresh muscles alone don't make a primed body — without a wearable, READY is as high as it goes.
  if (factors.length === 1 && level === 'push') level = 'train';
  return { score, level, factors, flags };
}

export const LEVEL: Record<Level, { word: string; dose: string }> = {
  push: { word: 'PRIMED', dose: 'Go for a top set on your first lift' },
  train: { word: 'READY', dose: 'Train as planned' },
  easy: { word: 'TAKE IT EASY', dose: 'One set less per lift, stop two reps short' },
  recover: { word: 'RECOVER', dose: 'Core and mobility only, or rest' },
};

// ── today ────────────────────────────────────────────────────────────────

export type Today = {
  focus: Focus;
  title: string;
  /** Training day per the routine (false = a rest day; the focus is then the next session). */
  scheduled: boolean;
  done: boolean;
  /** When the next session is if today is off or already done. */
  when: string;
  planned: Focus;
  swapped: boolean;
  fresh: number;                     // 0–100, the focus's muscles
  freshBy: Partial<Record<Focus, number>>;
  readiness: Readiness;
  setDelta: number;                  // −1 on EASY days
  reasons: string[];
};

const SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export function coachToday(input: {
  routine: Routine;
  /** Foci of finished sessions, newest first. */
  doneFoci: { focus: Focus; date: string }[];
  sessions: Session[];
  vitals: Vitals | null | undefined;
  now: Date;
}): Today {
  const { routine, doneFoci, sessions, vitals, now } = input;
  const t = now.getTime();
  const rot = rotation(routine);
  const todayKey = toDateKey(now);
  const done = doneFoci.some(d => d.date === todayKey);
  const scheduled = routine.days.length === 0 || routine.days.includes(DOW[now.getDay()]);
  const reasons: string[] = [];

  // Next in the rotation after the last finished session that belongs to it
  // (today's, once it's done — then this is tomorrow's).
  const last = doneFoci.find(d => rot.includes(d.focus));
  let idx = 0;
  if (last) {
    // A rotation can repeat a focus (7-day PPL ×2): step from its latest slot.
    const at = rot.lastIndexOf(last.focus);
    idx = (at + 1) % rot.length;
  } else {
    const onPaper = weekPlan(routine)[DOW[now.getDay()]];
    if (onPaper && rot.includes(onPaper as Focus)) idx = rot.indexOf(onPaper as Focus);
  }
  const planned = rot[idx];

  const freshBy: Partial<Record<Focus, number>> = {};
  for (const f of new Set(rot)) freshBy[f] = freshness(f, sessions, t);
  if (!rot.includes('core')) freshBy.core = freshness('core', sessions, t);

  let focus = planned;
  if ((freshBy[planned] ?? 100) < 70) {
    const best = [...new Set(rot)].sort((a, b) => (freshBy[b] ?? 0) - (freshBy[a] ?? 0))[0];
    if (best !== planned && (freshBy[best] ?? 0) - (freshBy[planned] ?? 0) >= 15) {
      const w = weakest(planned, sessions, t);
      reasons.push(`${muscleWord(w.id)} only ${w.pct}% recovered — ${FOCUS_TITLE[planned]} moved back`);
      reasons.push(`${FOCUS_TITLE[best]} muscles are ${freshBy[best]}% fresh`);
      focus = best;
    }
  }

  const r = readiness(vitals, systemicLoad(sessions, t), now);
  let setDelta = 0;
  if (r.level === 'easy') setDelta = -1;
  if (r.level === 'recover' && scheduled && !done) {
    reasons.unshift(`Readiness ${r.score} — swap today for core and mobility`);
    focus = 'core';
  }
  if (focus === planned && reasons.length === 0) {
    reasons.push(last ? `Next in your ${SPLIT_NAME[splitOf(routine)]} rotation` : `First session of your ${SPLIT_NAME[splitOf(routine)]} week`);
    if ((freshBy[focus] ?? 100) >= 85) reasons.push(`${FOCUS_TITLE[focus]} muscles are ${freshBy[focus]}% fresh`);
  }

  // When is it, if not now.
  let when = 'TODAY';
  if (done || !scheduled) {
    when = 'NEXT';
    for (let i = 1; i <= 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (routine.days.length === 0 || routine.days.includes(DOW[d.getDay()])) { when = i === 1 ? 'TOMORROW' : SHORT[d.getDay()]; break; }
    }
  }

  return {
    focus, title: FOCUS_TITLE[focus], scheduled, done, when, planned, swapped: focus !== planned,
    fresh: freshBy[focus] ?? freshness(focus, sessions, t), freshBy, readiness: r, setDelta, reasons,
  };
}

// ── chips: what fits a focus, and what can stand in for a lift ───────────


type Lift = { name: string; muscleGroups: MuscleGroup[] };
export type Pick = { name: string; muscleGroups: MuscleGroup[]; fit: number; mine: boolean };

/** How squarely a lift trains a focus, 0–1: its work landing on the focus's muscles. */
export function fitFor(focus: Focus, name: string, groups: MuscleGroup[]): number {
  const share = musclesFor(name, groups);
  const want = FOCUS_MUSCLES[focus];
  let hit = 0, all = 0;
  for (const [m, v] of Object.entries(share)) { all += v; hit += v * Math.min(1, want[m] ?? 0); }
  return all ? hit / all : 0;
}

const pool = (library: Lift[]) => {
  const seen = new Set<string>();
  const out: (Lift & { mine: boolean })[] = [];
  for (const e of library) if (!seen.has(e.name.toUpperCase())) { seen.add(e.name.toUpperCase()); out.push({ ...e, mine: true }); }
  for (const [name, muscleGroups] of CATALOGUE) if (!seen.has(name)) { seen.add(name); out.push({ name, muscleGroups, mine: false }); }
  return out;
};

/** Chips for the ADD tray: your lifts and the catalogue, best fit first, minus what's in the session. */
export function suggestFor(focus: Focus, library: Lift[], inSession: string[]): Pick[] {
  const taken = new Set(inSession.map(n => n.toUpperCase()));
  return pool(library)
    .filter(e => !taken.has(e.name.toUpperCase()))
    .map(e => ({ ...e, fit: fitFor(focus, e.name, e.muscleGroups) }))
    .filter(e => e.fit >= 0.45)
    .sort((a, b) => b.fit - a.fit || Number(b.mine) - Number(a.mine));
}

/** Lifts that work the same muscles (cosine of their muscle shares), closest first. */
export function alternativesFor(lift: Lift, library: Lift[], inSession: string[], n = 6): Pick[] {
  const a = musclesFor(lift.name, lift.muscleGroups);
  const norm = (s: Record<string, number>) => Math.sqrt(Object.values(s).reduce((x, v) => x + v * v, 0)) || 1;
  const na = norm(a);
  const taken = new Set([...inSession, lift.name].map(x => x.toUpperCase()));
  return pool(library)
    .filter(e => !taken.has(e.name.toUpperCase()))
    .map(e => {
      const b = musclesFor(e.name, e.muscleGroups);
      const dot = Object.entries(a).reduce((x, [m, v]) => x + v * (b[m] ?? 0), 0);
      return { ...e, fit: dot / (na * norm(b)) };
    })
    .filter(e => e.fit >= 0.6)
    .sort((x, y) => y.fit - x.fit || Number(y.mine) - Number(x.mine))
    .slice(0, n);
}
