// ─────────────────────────────────────────────────────────────────────────
// Exercise guide — what the GO sheet's exercise card shows: which movement
// it is (for the dot-matrix demo, components/ExerciseDemo.tsx), sets and
// reps for the muscle's goal, a starting weight, and a YouTube search.
//
// Starting weight, in order of trust:
//   1. Your own history for the exercise: your best estimated 1RM, brought
//      down to the target reps (Epley) at ~90% so the first set isn't a max.
//   2. Otherwise a novice ratio of bodyweight for that lift — about half of
//      the common "beginner" strength standards, i.e. a weight most people
//      new to it can do for 10 clean reps — scaled to the target reps. The
//      bodyweight used is capped at a BMI of 25 for your height: extra mass
//      past that is mostly not muscle that moves the bar. Women's ratios are
//      ~0.65× for upper body, ~0.8× for lower (same standards).
//   Bodyweight moves (pull-ups, push-ups, dips, planks…) say BODYWEIGHT.
// ─────────────────────────────────────────────────────────────────────────

import { findExercise } from './exercise-library';

export type Pattern =
  | 'squat' | 'legpress' | 'lunge' | 'hinge' | 'thrust' | 'bench' | 'pushup' | 'dip' | 'ohp'
  | 'raise' | 'lateral' | 'fly' | 'row' | 'cablerow' | 'pulldown' | 'pullup' | 'curl' | 'pushdown'
  | 'overheadext' | 'skull' | 'facepull' | 'shrug' | 'calf' | 'crunch' | 'legraise' | 'plank'
  | 'legext' | 'legcurl' | 'abduct' | 'twist' | 'run' | 'stand'
  | 'pullover' | 'invrow' | 'backext' | 'swing' | 'kickback' | 'sideplank' | 'carry' | 'clean' | 'jump'
  | 'jacks' | 'burpee' | 'rower' | 'bike';

export type Equipment = 'barbell' | 'dumbbell' | 'cable' | 'machine' | 'bodyweight';

export type Goal = 'strength' | 'size' | 'endurance' | 'easy';

export type Guide = {
  pattern: Pattern;
  equipment: Equipment;
  sets: number;
  reps: [number, number];
  /** kg (per hand for dumbbells), or null for bodyweight moves. */
  startKg: number | null;
  perHand: boolean;
  basis: 'history' | 'bodyweight' | 'none';
  rest: string;
  tip: string;
};

// Name → movement, first match wins (like lib/muscle-recovery.ts's RULES).
const PATTERNS: [RegExp, Pattern][] = [
  [/LEG PRESS/, 'legpress'], [/HIP THRUST|GLUTE BRIDGE/, 'thrust'], [/LUNGE|SPLIT SQUAT|STEP ?UP/, 'lunge'],
  [/SQUAT|HACK/, 'squat'], [/ROMANIAN|RDL|DEADLIFT|GOOD MORNING|STIFF|BACK EXT|HYPEREXT/, 'hinge'],
  [/LEG EXT/, 'legext'], [/LEG CURL|HAM(STRING)? CURL|NORDIC/, 'legcurl'], [/CALF|TIB(IALIS)? RAISE/, 'calf'],
  [/ABDUCT|ADDUCT/, 'abduct'], [/FACE PULL|REAR DELT|REVERSE (FLY|PEC)|EXTERNAL ROT|Y[ -]RAISE/, 'facepull'],
  [/LATERAL|SIDE RAISE|UPRIGHT/, 'lateral'], [/FRONT RAISE/, 'raise'], [/FLY|FLYE|PEC DECK|CROSSOVER/, 'fly'],
  [/PUSH ?UP|PRESS UP/, 'pushup'], [/\bDIPS?\b/, 'dip'], [/BENCH|CHEST PRESS|FLOOR PRESS|INCLINE( DB| DUMBBELL| BARBELL)? PRESS|DECLINE PRESS/, 'bench'],
  [/\bOHP\b|OVERHEAD PRESS|SHOULDER PRESS|MILITARY|ARNOLD|PUSH PRESS/, 'ohp'],
  [/PULL ?UP|\bCHIN(S|-?UPS?)?\b/, 'pullup'], [/PULL ?DOWN|STRAIGHT ARM/, 'pulldown'],
  [/CABLE ROW|SEATED ROW|SEATED CABLE/, 'cablerow'], [/\bROWS?\b/, 'row'], [/SHRUG|FARMER|CARRY/, 'shrug'],
  [/SKULL|LYING TRICEP/, 'skull'], [/OVERHEAD TRICEP|FRENCH PRESS|OVERHEAD EXT/, 'overheadext'],
  [/PUSHDOWN|PUSH DOWN|TRICEP|KICKBACK/, 'pushdown'], [/CLOSE GRIP/, 'bench'],
  [/CURL/, 'curl'], [/TWIST|WOODCHOP|SIDE BEND|PALLOF/, 'twist'], [/LEG RAISE|KNEE RAISE/, 'legraise'],
  [/PLANK|AB WHEEL|ROLLOUT|SERRATUS|SCAP/, 'plank'], [/CRUNCH|SIT ?UP|\bABS?\b/, 'crunch'],
  [/RUN|JOG|SPRINT|TREADMILL|WALK/, 'run'],
];

export function patternOf(name: string): Pattern {
  const lib = findExercise(name);
  if (lib) return lib.pattern;
  const n = ` ${name.toUpperCase()} `;
  return PATTERNS.find(([re]) => re.test(n))?.[1] ?? 'stand';
}

const BODYWEIGHT_MOVES: Pattern[] = ['pushup', 'dip', 'pullup', 'plank', 'legraise', 'crunch', 'run', 'stand',
  'invrow', 'backext', 'sideplank', 'jump', 'jacks', 'burpee'];

export function equipmentOf(name: string, pattern: Pattern): Equipment {
  const lib = findExercise(name);
  if (lib) return lib.kit;
  const n = name.toUpperCase();
  if (/\bDB\b|DUMBBELL|HAMMER|GOBLET|ARNOLD|KETTLEBELL|\bKB\b|FARMER/.test(n)) return 'dumbbell';
  if (/CABLE|PULLDOWN|PULL DOWN|PUSHDOWN|PUSH DOWN|FACE PULL|CROSSOVER|WOODCHOP|PALLOF|STRAIGHT ARM/.test(n)) return 'cable';
  if (/MACHINE|PEC DECK|SMITH|HACK|LEG PRESS|LEG EXT|LEG CURL|ABDUCT|ADDUCT|SEATED ROW|CHEST PRESS/.test(n)) return 'machine';
  if (/BARBELL|\bBB\b|BENCH PRESS|SQUAT|DEADLIFT|RDL|ROMANIAN|GOOD MORNING|\bOHP\b|MILITARY|SKULL|HIP THRUST|SHRUG|UPRIGHT|CLOSE GRIP|PREACHER/.test(n)) return 'barbell';
  if (/WEIGHTED/.test(n)) return 'dumbbell';
  if (BODYWEIGHT_MOVES.includes(pattern) || /BODYWEIGHT|NORDIC|BACK EXT|HYPEREXT|SUPERMAN|GLUTE BRIDGE/.test(n)) return 'bodyweight';
  return ({ lateral: 'dumbbell', raise: 'dumbbell', curl: 'dumbbell', fly: 'dumbbell', lunge: 'dumbbell', calf: 'machine',
    pushdown: 'cable', overheadext: 'dumbbell', facepull: 'cable', row: 'barbell', twist: 'cable' } as Partial<Record<Pattern, Equipment>>)[pattern] ?? 'barbell';
}

// Novice 10-rep weight as a fraction of bodyweight, per pattern and kit
// (dumbbells per hand). Roughly half of beginner strength standards.
const RATIO: Partial<Record<Pattern, Partial<Record<Equipment, number>>>> = {
  squat: { barbell: 0.55, dumbbell: 0.2, machine: 0.6 }, legpress: { machine: 1.0 }, lunge: { dumbbell: 0.1, barbell: 0.3 },
  hinge: { barbell: 0.6, dumbbell: 0.2, bodyweight: 0 }, thrust: { barbell: 0.6, machine: 0.6 },
  bench: { barbell: 0.45, dumbbell: 0.15, machine: 0.4 }, ohp: { barbell: 0.3, dumbbell: 0.1, machine: 0.3 },
  raise: { dumbbell: 0.05, cable: 0.06 }, lateral: { dumbbell: 0.045, cable: 0.05, barbell: 0.2 },
  fly: { dumbbell: 0.08, cable: 0.08, machine: 0.25 }, row: { barbell: 0.4, dumbbell: 0.18, machine: 0.4 },
  cablerow: { cable: 0.45, machine: 0.45 }, pulldown: { cable: 0.45, machine: 0.45 },
  curl: { barbell: 0.2, dumbbell: 0.08, cable: 0.15 }, pushdown: { cable: 0.2 },
  overheadext: { dumbbell: 0.12, cable: 0.15 }, skull: { barbell: 0.15, dumbbell: 0.06 }, facepull: { cable: 0.15, dumbbell: 0.03 },
  shrug: { barbell: 0.6, dumbbell: 0.25 }, calf: { machine: 0.5, dumbbell: 0.2, barbell: 0.5 },
  legext: { machine: 0.3 }, legcurl: { machine: 0.25 }, abduct: { machine: 0.35 }, twist: { cable: 0.1, dumbbell: 0.06 },
  crunch: { cable: 0.3, machine: 0.3 },
  pullover: { dumbbell: 0.15, barbell: 0.2, machine: 0.35 }, swing: { dumbbell: 0.2, cable: 0.3 },
  kickback: { cable: 0.08, machine: 0.25 }, carry: { dumbbell: 0.3, machine: 0.8 }, clean: { barbell: 0.35, dumbbell: 0.12 },
};
const LOWER: Pattern[] = ['squat', 'legpress', 'lunge', 'hinge', 'thrust', 'calf', 'legext', 'legcurl', 'abduct', 'swing', 'kickback'];

const SCHEME: Record<Goal, { sets: number; reps: [number, number]; rest: string }> = {
  strength: { sets: 4, reps: [4, 6], rest: '2–3 MIN REST' },
  size: { sets: 3, reps: [8, 12], rest: '90 S REST' },
  endurance: { sets: 3, reps: [15, 20], rest: '45–60 S REST' },
  easy: { sets: 2, reps: [12, 15], rest: '60 S REST · SLOW, PAIN-FREE' },
};

/** A muscle's goal category name → a rep scheme ("STRENGTH" → strength, "PAIN" → easy…). */
export function goalOf(category: string | null | undefined): Goal {
  const c = (category ?? '').toUpperCase();
  if (/STRENGTH|POWER|STRONG|MAX/.test(c)) return 'strength';
  if (/PAIN|INJUR|REHAB|RECOVER|MOBIL|SORE|TIGHT/.test(c)) return 'easy';
  if (/ENDUR|TONE|CUT|LEAN|FAT/.test(c)) return 'endurance';
  return 'size';
}

const epley = (kg: number, reps: number) => kg * (1 + reps / 30);
const round = (kg: number, eq: Equipment) => {
  const step = eq === 'dumbbell' ? (kg < 10 ? 1 : 2) : 2.5;
  return Math.max(step, Math.round(kg / step) * step);
};

export function guideFor(name: string, ctx: {
  goal: Goal; bodyKg: number | null; heightCm: number | null; sex: string | null;
  bestE1rmKg?: number | null;
}): Guide {
  const pattern = patternOf(name);
  const equipment = equipmentOf(name, pattern);
  const { sets, reps, rest } = SCHEME[ctx.goal];
  const target = Math.round((reps[0] + reps[1]) / 2);
  // Goblet squats, overhead extensions, pullovers and swings hold one dumbbell or bell; the rest, one per hand.
  const perHand = equipment === 'dumbbell' && !['squat', 'overheadext', 'pullover', 'swing'].includes(pattern);
  const tip = `ADD WEIGHT ONCE EVERY SET HITS ${reps[1]}`;

  if (equipment === 'bodyweight') return { pattern, equipment, sets, reps, startKg: null, perHand: false, basis: 'none', rest, tip };

  if (ctx.bestE1rmKg && ctx.bestE1rmKg > 0) {
    const kg = round((ctx.bestE1rmKg / (1 + target / 30)) * 0.9, equipment);
    return { pattern, equipment, sets, reps, startKg: kg, perHand, basis: 'history', rest, tip };
  }

  const ratio = RATIO[pattern]?.[equipment] ?? RATIO[pattern]?.[Object.keys(RATIO[pattern] ?? {})[0] as Equipment];
  if (!ratio || !ctx.bodyKg) return { pattern, equipment, sets, reps, startKg: null, perHand, basis: 'none', rest, tip };
  const h = ctx.heightCm ? ctx.heightCm / 100 : null;
  const effective = h ? Math.min(ctx.bodyKg, 25 * h * h) : ctx.bodyKg;
  const female = /^f/i.test(ctx.sex ?? '');
  const sexK = female ? (LOWER.includes(pattern) ? 0.8 : 0.65) : 1;
  // The ratio is a 10-rep weight; move it to the target reps through Epley.
  const kg = (epley(effective * ratio * sexK, 10) / (1 + target / 30));
  return { pattern, equipment, sets, reps, startKg: round(kg, equipment), perHand, basis: 'bodyweight', rest, tip };
}

export const videoUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} proper form tutorial`)}`;

// ── how hard a weight is ─────────────────────────────────────────────────

export type Difficulty = {
  /** Reps you'd have left at the end of the set (negative = can't finish it). */
  rir: number;
  /** 0–1 for the dot bar: green (easy) → red (max or beyond). */
  level: number;
  word: 'EASY' | 'MODERATE' | 'HARD' | 'MAX' | 'TOO HEAVY';
};

/** Your estimated 1RM for a lift: the best you've done (puck history), else
 *  backed out of the guide's starting weight, a weight with ~4 reps to spare. */
export function e1rmFor(g: Guide, bestE1rmKg?: number | null): { kg: number; measured: boolean } | null {
  if (bestE1rmKg && bestE1rmKg > 0) return { kg: bestE1rmKg, measured: true };
  if (g.startKg == null) return null;
  const target = Math.round((g.reps[0] + g.reps[1]) / 2);
  return { kg: (g.startKg / 0.9) * (1 + target / 30), measured: false };
}

/** How hard `reps` at `kg` is against a 1RM, through Epley: reps possible = 30 × (1RM / kg − 1). */
export function difficulty(kg: number, reps: number, e1rmKg: number): Difficulty | null {
  if (kg <= 0 || e1rmKg <= 0) return null;
  const possible = 30 * (e1rmKg / kg - 1);
  const rir = Math.round(possible - reps);
  const level = Math.max(0.06, Math.min(1, (6 - rir) / 7));
  const word = rir >= 4 ? 'EASY' : rir >= 2 ? 'MODERATE' : rir === 1 ? 'HARD' : rir === 0 ? 'MAX' : 'TOO HEAVY';
  return { rir, level, word };
}

/** "8-10" → [8, 10]; "12" → [12, 12]. */
export const repRange = (reps: string): [number, number] => {
  const [a, b] = reps.split('-').map(x => parseInt(x, 10));
  const lo = Number.isFinite(a) ? a : 10;
  return [lo, Number.isFinite(b) ? b : lo];
};
export const repText = ([a, b]: [number, number]) => (a === b ? `${a}` : `${a}-${b}`);

/** Moves a rep range as one piece, keeping it inside 1–50 so it never collapses. */
export function shiftReps(reps: string, d: number): string {
  const [lo, hi] = repRange(reps);
  const k = Math.max(1 - lo, Math.min(50 - hi, d));
  return repText([lo + k, hi + k]);
}

const LB = 2.2046226218;
/** The plate grid in the unit shown: 2.5 kg on a bar, stack or cable; dumbbells
 *  go by 1 kg up to 10 and by 2 kg after; 5 lb for everything in imperial. */
const grid = (v: number, up: boolean, eq: Equipment, unit: 'metric' | 'imperial') =>
  unit === 'imperial' ? 5 : eq === 'dumbbell' ? ((up ? v < 10 : v <= 10) ? 1 : 2) : 2.5;

/** `steps` notches of the weight stepper from `kg`: an off-grid weight first
 *  lands on the grid, so every value shown is a weight you can load. */
export function nextWeight(kg: number, steps: number, eq: Equipment, unit: 'metric' | 'imperial'): number {
  const up = steps > 0;
  // Hundredths in the shown unit, so 45 LB stored as 20.412 KG reads back as 45 exactly.
  let v = Math.round(Math.max(0, kg) * (unit === 'imperial' ? LB : 1) * 100) / 100;
  for (let i = 0; i < Math.abs(steps); i++) {
    const g = grid(v, up, eq, unit);
    v = up ? Math.floor(v / g + 1e-9) * g + g : Math.ceil(v / g - 1e-9) * g - g;
    v = Math.max(0, Math.min(unit === 'imperial' ? 1100 : 500, v));
  }
  return Math.round((unit === 'imperial' ? v / LB : v) * 1000) / 1000;
}

/** The nearest weight on that grid — what the coach recommends in the unit you read. */
export function snapWeight(kg: number, eq: Equipment, unit: 'metric' | 'imperial'): number {
  if (kg <= 0) return 0;
  const v = kg * (unit === 'imperial' ? LB : 1);
  const g = grid(v, true, eq, unit);
  const snapped = Math.max(g, Math.round(v / g) * g);
  return Math.round((unit === 'imperial' ? snapped / LB : snapped) * 1000) / 1000;
}
