// ─────────────────────────────────────────────────────────────────────────
// Twin — a model of you that sets the day. Pure: your goal, your body, the
// last few days (steps, water, food, sleep, weight, runs), the coach's pick
// and readiness (lib/coach.ts) and the muscles' recovery come in; today's
// four targets, every adjustment and why, the week ahead and when the goal
// should land go out.
//
//   FUEL    burn = BMR (Mifflin-St Jeor) × 1.15 + steps × 0.04 kcal (per
//           70 kg) + the session (≈300 kcal lifting) + runs (≈1 kcal/kg/km),
//           so training days eat more than rest days. The goal moves it
//           (ABS FAST −25%, BUILD +12% …). A short night or a RECOVER day caps
//           the deficit at −15% (sleep-deprived dieting loses muscle instead
//           of fat). Yesterday's food against yesterday's real burn is half
//           paid back, and the weight trend nudges it (losing >1%/week → +150).
//           Protein per kg by goal, fat 25%, carbs the rest.
//   STEPS   the goal's number, ramped from your own 7-day average (+1,500 at
//           most) so it's reachable. Rest days on a cut add 1,500; a RECOVER
//           day, tired legs or a long run yesterday take some off.
//   WATER   35 ml/kg, +500 on a training day, +100 per 1,000 steps past
//           8,000, +250 for a high-protein cut, +250 if yesterday came up short.
//   SLEEP   8 h (9 under 18, 7½ from 65), plus half of the last three nights'
//           debt (≤1 h), +30 min when HRV or readiness is low, +15 after a
//           big session. Bedtime counts back from your usual wake time.
//   WEEK    the routine's rotation dealt onto the coming training days with
//           each day's own steps, food, water and sleep.
//   OUTLOOK fat goals: estimated body fat (Deurenberg, from BMI) to the goal's
//           level at the week's average deficit (7,700 kcal/kg) → weeks.
// ─────────────────────────────────────────────────────────────────────────

import { rotation, FOCUS_TITLE, type Routine, type Today, type Weekday } from './coach';
import { muscleStatus, type Session } from './muscle-recovery';
import { toDateKey } from './dateKey';
import type { Focus } from './workout-data';

export type GoalId = 'abs' | 'cut' | 'build' | 'strong' | 'endure' | 'health';
export type Pace = 'steady' | 'fast' | 'max';
export type TwinGoal = { id: GoalId; pace: Pace };

export const GOALS: { id: GoalId; word: string; line: string }[] = [
  { id: 'abs', word: 'ABS', line: 'Lean out until they show' },
  { id: 'cut', word: 'LOSE FAT', line: 'Drop fat, keep muscle' },
  { id: 'build', word: 'BUILD', line: 'Lean bulk, add muscle' },
  { id: 'strong', word: 'STRENGTH', line: 'Heavier lifts' },
  { id: 'endure', word: 'ENDURANCE', line: 'Further, fitter heart' },
  { id: 'health', word: 'HEALTH', line: 'Feel good, keep going' },
];
export const PACES: { id: Pace; word: string; line: string }[] = [
  { id: 'steady', word: 'STEADY', line: 'Easy to keep' },
  { id: 'fast', word: 'FAST', line: 'Harder, sooner' },
  { id: 'max', word: 'ALL IN', line: 'A few weeks at most' },
];
export const DEFAULT_GOAL: TwinGoal = { id: 'health', pace: 'steady' };
export const goalWord = (id: GoalId) => GOALS.find(g => g.id === id)?.word ?? id.toUpperCase();
export const paceWord = (p: Pace) => PACES.find(x => x.id === p)?.word ?? p.toUpperCase();

const PACE_I: Record<Pace, number> = { steady: 0, fast: 1, max: 2 };
const ENERGY: Record<GoalId, [number, number, number]> = {
  abs: [-0.2, -0.25, -0.3], cut: [-0.15, -0.2, -0.25], build: [0.08, 0.12, 0.15],
  strong: [0.05, 0.08, 0.1], endure: [0, 0, 0.05], health: [0, 0, 0],
};
const PROTEIN: Record<GoalId, number> = { abs: 2.2, cut: 2.2, build: 2.0, strong: 2.0, endure: 1.6, health: 1.6 };
const STEPS: Record<GoalId, number> = { abs: 12000, cut: 11000, build: 8000, strong: 8000, endure: 10000, health: 9000 };
const EXTRA: Record<GoalId, { train: string | null; rest: string | null }> = {
  abs: { train: 'CORE FINISHER', rest: 'ZONE 2 30 MIN' },
  cut: { train: null, rest: 'ZONE 2 30 MIN' },
  build: { train: null, rest: 'REST AND EAT' },
  strong: { train: null, rest: 'MOBILITY' },
  endure: { train: null, rest: 'EASY RUN 5K' },
  health: { train: null, rest: 'WALK 30 MIN' },
};

export type Profile = {
  age: number | null; sex: string | null; heightCm: number | null; weightKg: number | null; goalWeightKg: number | null;
};

export type TwinInput = {
  now: Date;
  goal: TwinGoal;
  profile: Profile;
  /** Weigh-ins, any order. */
  weights: { kg: number; at: string }[];
  steps: Record<string, number>;
  /** ml drunk per day. */
  water: Record<string, number>;
  /** kcal eaten per day — only days with food logged. */
  eaten: Record<string, number>;
  /** Minutes asleep, keyed by the morning the night ended. */
  sleep: Record<string, number>;
  /** Usual wake time 'HH:MM', if known. */
  wake: string | null;
  /** km run per day. */
  runsKm: Record<string, number>;
  coach: Today;
  routine: Routine | null;
  sessions: Session[];
};

/** One line of a target's working: the base (delta = the base value) or an adjustment. */
export type Line = { label: string; delta: number };
export type Target = { value: number; lines: Line[] };
export type Fuel = Target & { proteinG: number; carbsG: number; fatG: number; burn: number };
export type Sleep = Target & { bed: string; wake: string };

export type DayPlan = {
  key: string; dow: string; today: boolean; done: boolean;
  focus: Focus | null; word: string; extra: string | null;
  steps: number; kcal: number; waterMl: number; sleepMin: number;
};
export type Group = { id: string; word: string; pct: number; readyAt: number | null };
export type Outlook = { headline: string; sub: string; weeks: number | null; bodyFat: number | null; targetFat: number | null };
export type LogLine = { tag: 'BODY' | 'TRAIN' | 'STEPS' | 'WATER' | 'FUEL' | 'SLEEP'; text: string };

export type Twin = {
  goal: TwinGoal;
  steps: Target;
  water: Target;
  fuel: Fuel;
  sleep: Sleep;
  week: DayPlan[];
  groups: Group[];
  outlook: Outlook;
  log: LogLine[];
  /** Inputs the twin had to guess. */
  assumed: ('weight' | 'height' | 'age')[];
};

// ── helpers ──────────────────────────────────────────────────────────────

const DOW: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const roundTo = (x: number, to: number) => Math.round(x / to) * to;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const dayKey = (now: Date, d: number) => toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + d));
export const hm = (min: number) => `${Math.floor(min / 60)}H${String(Math.round(min % 60)).padStart(2, '0')}`;
const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

/** Values for the n complete days before today that exist (and aren't zero). */
function lastDays(series: Record<string, number>, now: Date, n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= n; d++) { const v = series[dayKey(now, -d)]; if (v != null && v > 0) out.push(v); }
  return out;
}

const HEAVY: Focus[] = ['legs', 'lower', 'full'];
const isLift = (s: Session) => s.name !== 'RUN' && s.name !== 'WALKING';

// ── the body ─────────────────────────────────────────────────────────────

type Body = { kg: number; cm: number; age: number; male: number; bmr: number; assumed: Twin['assumed'] };

function bodyOf(p: Profile, weights: TwinInput['weights']): Body {
  const assumed: Twin['assumed'] = [];
  const logged = [...weights].sort((a, b) => a.at.localeCompare(b.at)).pop()?.kg;
  const male = p.sex === 'Male' ? 1 : p.sex === 'Female' ? 0 : 0.5;
  const kg = logged ?? p.weightKg ?? (assumed.push('weight'), 75);
  const cm = p.heightCm ?? (assumed.push('height'), male === 1 ? 177 : male === 0 ? 163 : 170);
  const age = p.age ?? (assumed.push('age'), 30);
  const bmr = 10 * kg + 6.25 * cm - 5 * age - 161 + 166 * male;
  return { kg, cm, age, male, bmr, assumed };
}

/** A day's energy out: resting (plus digesting) + walking + the session + running. */
function burnOf(b: Body, steps: number, lift: Focus | null, runKm: number): number {
  const session = lift ? (lift === 'core' ? 150 : 300) * (b.kg / 75) : 0;
  return b.bmr * 1.15 + steps * 0.04 * (b.kg / 70) + session + runKm * b.kg;
}

/** kg per week from weigh-ins over the last three weeks (least squares), with the span in days. */
function weightTrend(weights: TwinInput['weights'], now: Date): { perWeek: number; span: number } | null {
  const since = now.getTime() - 21 * 86_400_000;
  const pts = weights.map(w => ({ t: Date.parse(w.at), kg: w.kg })).filter(p => p.t >= since && p.t <= now.getTime());
  if (pts.length < 3) return null;
  const t0 = Math.min(...pts.map(p => p.t));
  const span = (Math.max(...pts.map(p => p.t)) - t0) / 86_400_000;
  if (span < 7) return null;
  const xs = pts.map(p => (p.t - t0) / 86_400_000), ys = pts.map(p => p.kg);
  const mx = mean(xs)!, my = mean(ys)!;
  const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  const sxy = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0);
  return { perWeek: (sxy / sxx) * 7, span };
}

// ── muscles, grouped the way people talk about them ──────────────────────

const GROUPS: [string, string, string[]][] = [
  ['chest', 'CHEST', ['pec.upper', 'pec.lower']],
  ['back', 'BACK', ['lat', 'traps.mid', 'teres']],
  ['delts', 'DELTS', ['delt.front', 'delt.side', 'delt.rear']],
  ['arms', 'ARMS', ['biceps', 'triceps.lat', 'triceps.long']],
  ['abs', 'ABS', ['abs.upper', 'abs.lower', 'oblique']],
  ['quads', 'QUADS', ['quad.rf', 'quad.vl', 'quad.vm']],
  ['hams', 'HAMS', ['ham.bf', 'ham.st']],
  ['glutes', 'GLUTES', ['glute.max', 'glute.med']],
  ['calves', 'CALVES', ['gastro.lat', 'gastro.med', 'soleus']],
];

export function muscleGroups(sessions: Session[], now: number): Group[] {
  return GROUPS.map(([id, word, ids]) => {
    const st = ids.map(m => muscleStatus(m, sessions, now));
    const ready = st.map(s => s.readyAt).filter((x): x is number => x != null);
    return { id, word, pct: Math.min(...st.map(s => s.pct)), readyAt: ready.length ? Math.max(...ready) : null };
  });
}

// ── the twin ─────────────────────────────────────────────────────────────

export function buildTwin(input: TwinInput): Twin {
  const { now, goal, coach } = input;
  const b = bodyOf(input.profile, input.weights);
  const pi = PACE_I[goal.pace];
  const energy0 = ENERGY[goal.id][pi];
  const cutting = energy0 < 0;
  const readiness = coach.readiness;
  const lastNight = input.sleep[dayKey(now, 0)] ?? null;
  const yKey = dayKey(now, -1);
  const groups = muscleGroups(input.sessions, now.getTime());
  const legs = Math.min(...groups.filter(g => g.id === 'quads' || g.id === 'calves').map(g => g.pct));
  const trainsToday = coach.scheduled;
  const todayLift: Focus | null = trainsToday ? coach.focus : null;
  const log: LogLine[] = [];

  log.push({ tag: 'BODY', text: `Readiness ${readiness.score} — ${readiness.factors.map(f => `${f.label.toLowerCase()} ${f.value}`).join(', ')}` });
  if (coach.reasons[0]) log.push({ tag: 'TRAIN', text: coach.reasons[0] });
  readiness.flags.forEach(f => log.push({ tag: 'BODY', text: f }));

  // STEPS
  const goalSteps = roundTo(STEPS[goal.id] * (cutting ? [1, 1.08, 1.15][pi] : 1), 500);
  const avg7 = mean(lastDays(input.steps, now, 7));
  const stepsBase = avg7 == null || avg7 >= goalSteps ? goalSteps : Math.max(5000, Math.min(goalSteps, roundTo(avg7 + 1500, 500)));
  const steps: Target = {
    value: 0,
    lines: [{ label: avg7 != null && stepsBase < goalSteps ? `YOUR 7-DAY AVG ${fmt(avg7)} + 1,500` : `${goalWord(goal.id)} GOAL`, delta: stepsBase }],
  };
  if (!trainsToday && cutting) steps.lines.push({ label: 'REST DAY, MOVE MORE', delta: 1500 });
  if (readiness.level === 'recover') steps.lines.push({ label: 'LOW READINESS, EASY WALKS', delta: -roundTo(stepsBase * 0.2, 250) });
  else if (legs < 60) steps.lines.push({ label: `LEGS AT ${legs}%`, delta: -roundTo(stepsBase * 0.1, 250) });
  if ((input.runsKm[yKey] ?? 0) >= 8) steps.lines.push({ label: 'LONG RUN YESTERDAY', delta: -1000 });
  steps.value = Math.max(4000, roundTo(steps.lines.reduce((a, l) => a + l.delta, 0), 250));

  // FUEL
  const burn = burnOf(b, steps.value, todayLift, 0);
  let energy = energy0;
  const fuelLines: Line[] = [{ label: todayLift ? 'BURN, WITH THE SESSION' : 'BURN, REST DAY', delta: roundTo(burn, 10) }];
  if (cutting && ((lastNight != null && lastNight < 360) || readiness.level === 'recover') && energy < -0.15) {
    energy = -0.15;
  }
  if (energy0 !== 0) fuelLines.push({ label: `${goalWord(goal.id)} ${paceWord(goal.pace)} ${energy0 > 0 ? '+' : ''}${Math.round(energy0 * 100)}%`, delta: roundTo(burn * energy0, 10) });
  if (energy !== energy0) fuelLines.push({ label: lastNight != null && lastNight < 360 ? 'SHORT NIGHT, DEFICIT EASED' : 'RECOVER DAY, DEFICIT EASED', delta: roundTo(burn * (energy - energy0), 10) });
  // Yesterday: what was eaten against what was really burned.
  if (input.eaten[yKey] != null) {
    const yLift = input.sessions.some(s => s.date === yKey && isLift(s)) ? 'full' as Focus : null;
    const yBurn = burnOf(b, input.steps[yKey] ?? steps.value, yLift, input.runsKm[yKey] ?? 0) * (1 + energy0);
    const over = input.eaten[yKey] - yBurn;
    if (over > 300) fuelLines.push({ label: `ATE ${fmt(over)} OVER YESTERDAY`, delta: -roundTo(Math.min(300, over / 2), 10) });
    else if (cutting && over < -500) fuelLines.push({ label: `ATE ${fmt(-over)} UNDER YESTERDAY`, delta: roundTo(Math.min(200, -over / 3), 10) });
  }
  const trend = weightTrend(input.weights, now);
  if (trend) {
    const pct = (trend.perWeek / b.kg) * 100;
    if (cutting && pct < -1) fuelLines.push({ label: `LOSING ${Math.abs(trend.perWeek).toFixed(1)} KG A WEEK, KEEP MUSCLE`, delta: 150 });
    else if (cutting && pct > -0.25 && trend.span >= 14) fuelLines.push({ label: 'WEIGHT STALLED', delta: -100 });
    else if (energy0 > 0 && pct > 0.5) fuelLines.push({ label: 'GAINING FAST', delta: -100 });
    else if (energy0 > 0 && pct < 0.1 && trend.span >= 14) fuelLines.push({ label: 'WEIGHT NOT MOVING', delta: 150 });
  }
  const floor = 1200 + 300 * b.male;
  const kcal = roundTo(Math.max(floor, b.bmr, fuelLines.reduce((a, l) => a + l.delta, 0)), 10);
  const proteinG = Math.round(b.kg * PROTEIN[goal.id] * (cutting && pi === 2 ? 1.1 : 1));
  const fatG = Math.round(Math.max(b.kg * 0.6, (kcal * 0.25) / 9));
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  const fuel: Fuel = { value: kcal, lines: fuelLines, proteinG, carbsG, fatG, burn: roundTo(burn, 10) };

  // WATER
  const waterBase = roundTo(b.kg * 35, 250);
  const water: Target = { value: 0, lines: [{ label: `35 ML x ${Math.round(b.kg)} KG`, delta: waterBase }] };
  if (trainsToday) water.lines.push({ label: 'TRAINING TODAY', delta: 500 });
  const stepWater = roundTo((Math.max(0, steps.value - 8000) / 1000) * 100, 250);
  if (stepWater > 0) water.lines.push({ label: `${fmt(steps.value)} STEPS`, delta: stepWater });
  if (cutting && PROTEIN[goal.id] >= 2.2) water.lines.push({ label: 'HIGH PROTEIN', delta: 250 });
  if (input.water[yKey] != null && input.water[yKey] < waterBase * 0.7) water.lines.push({ label: 'SHORT YESTERDAY', delta: 250 });
  water.value = clamp(roundTo(water.lines.reduce((a, l) => a + l.delta, 0), 250), 2000, 5000);

  // SLEEP
  const need = b.age < 18 ? 540 : b.age >= 65 ? 450 : 480;
  const sleepLines: Line[] = [{ label: `NEED AT ${b.age}`, delta: need }];
  let debt = 0;
  for (let d = 0; d < 3; d++) { const a = input.sleep[dayKey(now, -d)]; if (a != null && a > 0) debt += Math.max(0, need - a); }
  const payback = Math.min(60, roundTo(debt / 2, 15));
  if (payback > 0) sleepLines.push({ label: `${hm(debt)} DEBT, HALF BACK`, delta: payback });
  const hrv = readiness.factors.find(f => f.id === 'hrv');
  if (hrv && hrv.score < 40) sleepLines.push({ label: 'HRV LOW', delta: 30 });
  else if (readiness.level === 'easy' || readiness.level === 'recover') sleepLines.push({ label: 'READINESS LOW', delta: 30 });
  if (todayLift && HEAVY.includes(todayLift)) sleepLines.push({ label: 'BIG SESSION TODAY', delta: 15 });
  const sleepMin = Math.min(need + 90, sleepLines.reduce((a, l) => a + l.delta, 0));
  const wake = input.wake ?? '07:00';
  const sleep: Sleep = { value: sleepMin, lines: sleepLines, wake, bed: clock(toMin(wake) - sleepMin - 15) };

  // Log the adjustments, biggest levers first.
  const note = (tag: LogLine['tag'], t: Target, unit: (n: number) => string) =>
    t.lines.slice(1).forEach(l => log.push({ tag, text: `${l.delta > 0 ? '+' : '−'}${unit(Math.abs(l.delta))} ${l.label.toLowerCase()}` }));
  note('FUEL', fuel, n => `${fmt(n)} kcal`);
  note('STEPS', steps, n => fmt(n));
  note('SLEEP', sleep, n => `${n} min`);
  note('WATER', water, n => `${fmt(n)} ml`);

  // WEEK
  const rot = input.routine ? rotation(input.routine) : [];
  const trainDays = input.routine?.days ?? [];
  let k = rot.indexOf(coach.scheduled ? coach.planned : coach.focus);
  if (coach.scheduled) k += 1;
  if (k < 0) k = 0;
  const extra = EXTRA[goal.id];
  const week: DayPlan[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    let focus: Focus | null = null;
    if (i === 0) focus = todayLift;
    else if (rot.length && trainDays.includes(DOW[d.getDay()])) focus = rot[k++ % rot.length];
    const daySteps = i === 0 ? steps.value : roundTo(stepsBase + (!focus && cutting ? 1500 : 0), 250);
    const runKm = !focus && goal.id === 'endure' ? 5 : 0;
    const dayBurn = burnOf(b, daySteps, focus, runKm);
    week.push({
      key: toDateKey(d), dow: i === 0 ? 'TODAY' : SHORT[d.getDay()], today: i === 0, done: i === 0 && coach.done,
      focus, word: focus ? focus.toUpperCase() : 'REST',
      extra: focus ? extra.train : extra.rest,
      steps: daySteps,
      kcal: i === 0 ? kcal : roundTo(Math.max(floor, b.bmr, dayBurn * (1 + energy0)), 10),
      waterMl: i === 0 ? water.value : clamp(roundTo(waterBase + (focus ? 500 : 0) + (Math.max(0, daySteps - 8000) / 1000) * 100, 250), 2000, 5000),
      sleepMin: i === 0 ? sleepMin : need + (focus && HEAVY.includes(focus) ? 15 : 0),
    });
  }

  return { goal, steps, water, fuel, sleep, week, groups, outlook: outlookOf(input, b, week), log, assumed: b.assumed };
}

// ── when the goal lands ──────────────────────────────────────────────────

function outlookOf(input: TwinInput, b: Body, week: DayPlan[]): Outlook {
  const { goal } = input;
  const burns = week.map(d => burnOf(b, d.steps, d.focus, !d.focus && goal.id === 'endure' ? 5 : 0));
  const balance = mean(week.map((d, i) => d.kcal - burns[i]))!; // kcal/day, negative = deficit
  const sessions = week.filter(d => d.focus).length;
  const weekSteps = week.reduce((a, d) => a + d.steps, 0);

  if (goal.id === 'abs' || goal.id === 'cut') {
    const bmi = b.kg / (b.cm / 100) ** 2;
    const bf = clamp(1.2 * bmi + 0.23 * b.age - 10.8 * b.male - 5.4, 4, 60);
    const tbf = goal.id === 'abs' ? 19 - 7 * b.male : 23 - 8 * b.male;
    const lean = b.kg * (1 - bf / 100);
    const gw = input.profile.goalWeightKg;
    const targetKg = goal.id === 'cut' && gw && gw < b.kg ? gw : lean / (1 - tbf / 100);
    const toLose = b.kg - targetKg;
    const perWeek = (-balance * 7) / 7700;
    const r1 = (x: number) => Math.round(x * 10) / 10;
    if (toLose <= 0.3) {
      return { headline: 'THERE', sub: `About ${Math.round(bf)}% body fat — hold here and keep training`, weeks: 0, bodyFat: Math.round(bf), targetFat: tbf };
    }
    const weeks = perWeek > 0.05 ? Math.ceil(toLose / perWeek) : null;
    return {
      headline: weeks != null ? `${weeks} WEEKS` : 'NO DEFICIT',
      sub: `${r1(b.kg)} → ${r1(targetKg)} kg · about ${Math.round(bf)}% → ${tbf}% body fat · ${r1(perWeek)} kg a week`,
      weeks, bodyFat: Math.round(bf), targetFat: tbf,
    };
  }
  if (goal.id === 'build') {
    const perWeek = (balance * 7) / 7000;
    const gw = input.profile.goalWeightKg;
    const weeks = gw && gw > b.kg && perWeek > 0.02 ? Math.ceil((gw - b.kg) / perWeek) : null;
    return {
      headline: `+${(Math.round(perWeek * 100) / 100).toFixed(2)} KG/WK`,
      sub: weeks ? `${Math.round(b.kg)} → ${gw} kg in about ${weeks} weeks` : `${sessions} sessions this week, each muscle twice`,
      weeks, bodyFat: null, targetFat: null,
    };
  }
  if (goal.id === 'strong') {
    return { headline: `${sessions} SESSIONS`, sub: 'This week — heavy compounds first, full recovery between', weeks: null, bodyFat: null, targetFat: null };
  }
  return {
    headline: `${Math.round(weekSteps / 1000)}K STEPS`,
    sub: goal.id === 'endure' ? `This week — ${sessions} sessions, easy runs on rest days` : `This week — ${sessions} sessions, sleep first`,
    weeks: null, bodyFat: null, targetFat: null,
  };
}

/** One line telling you the day, for the top of TODAY. */
export function directive(t: Twin, coach: Today): string {
  const food = `${fmt(t.fuel.value)} kcal, ${t.fuel.proteinG} g protein`;
  const rest = `walk ${fmt(t.steps.value)}, drink ${Math.round(t.water.value / 50) / 20} L, bed by ${t.sleep.bed}.`;
  if (coach.readiness.level === 'recover') return `Recovery day, readiness ${coach.readiness.score}. Eat ${food}, ${rest}`;
  if (coach.scheduled && coach.done) return `Session done. Refuel with ${food}, ${rest}`;
  if (coach.scheduled) return `${FOCUS_TITLE[coach.focus].toLowerCase().replace(/^\w/, c => c.toUpperCase())} at ${coach.fresh}% fresh. Eat ${food}, ${rest}`;
  return `Rest day. Eat ${food}, ${rest}`;
}
