// ─────────────────────────────────────────────────────────────────────────
// BODY PAGE — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// This is the single source of truth for everything shown on the BODY screen.
// It follows the same "local-first" pattern as the TODAY screen: everything
// lives in AsyncStorage so the UI is instant and works offline. (Cloud sync to
// the Supabase tables described in the spec is a later step — this layer is
// structured so that adding it later is a drop-in.)
//
// On first launch we SEED realistic data so the page looks exactly like the
// design mock. Water and weight are fully interactive — logging them writes
// back here and the page recomputes live.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';

const BODY_KEY = '@body';

// ── Types ────────────────────────────────────────────────────────────────

// A single day's square in the steps heatmap is derived from count vs goal.
export type SquareState = 'hit' | 'partial' | 'missed' | 'empty';

// A training day is one of four kinds (drives the training heatmap squares).
export type DayType = 'trained' | 'rest' | 'cheat' | 'missed';

// Movement categories used by the PUSH/PULL/LEGS/UPPER/LOWER filter pills.
export type Movement = 'push' | 'pull' | 'legs' | 'upper' | 'lower';

export type ExerciseSet = { weightKg: number; reps: number };

export type Exercise = {
  name: string;
  icon: string;            // MaterialCommunityIcons name
  sets: ExerciseSet[];
  pbDeltaKg?: number;      // if present, shows a "PB +Xkg" badge
};

export type WorkoutTemplate = {
  id: string;
  name: string;            // e.g. "PULL DAY"
  movement: Movement;
  exercises: Exercise[];
  extraCount: number;      // "+ N MORE EXERCISES" shown under the list
};

export type HeadlineLift = {
  name: string;            // "BENCH PRESS"
  icon: string;
  oneRmKg: number;         // 100
  deltaKg: number;         // +5 (vs last month)
  history: number[];       // sparkline points (oldest → newest)
};

export type WeightLog = { weightKg: number; at: string };
export type WaterLog = { amountMl: number; at: string };

export type BodyData = {
  // 1.1 Global stats bar
  workoutsTotal: number;
  stepsThisYear: number;
  streak: number;

  // 1.2 Steps
  stepsGoal: number;
  stepsHistory: Record<string, number>;   // dateKey → step count

  // 1.3 Training
  nextSession: { name: string; when: string; time: string };
  trainingHistory: Record<string, DayType>;
  activeMovement: Movement;
  templates: WorkoutTemplate[];

  // 1.5 Strength (3 headline lifts)
  headlineLifts: HeadlineLift[];

  // Body metrics row
  weightLogs: WeightLog[];
  weakestMuscle: { name: string; pct: number };       // pct is negative, e.g. -12
  strengthTrend: { pct: number; history: number[] };  // overall strength +18%

  // 1.10 Recovery
  sleepMins: number;            // 462 = 7h 42m
  waterLogs: WaterLog[];
  waterGoalMl: number;
  proteinTodayG: number;
  proteinGoalG: number;
};

// ── Date helpers ───────────────────────────────────────────────────────────
// Same key format as the rest of the app: "YYYY-M-D" with a 0-indexed month.

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(base.getDate() + delta);
  return d;
}

// ── Seed (first-launch demo data that matches the design mock) ──────────────

function seedStepsHistory(goal: number): Record<string, number> {
  const out: Record<string, number> = {};
  const today = startOfToday();
  // 56 days of history so the heatmap has plenty to draw.
  for (let i = 0; i < 56; i++) {
    const d = addDays(today, -i);
    let count: number;
    if (i === 0) {
      count = 16842;                          // today's headline number
    } else {
      const r = (i * 37) % 100;               // deterministic pseudo-pattern
      if (r < 62)      count = goal + (r * 28);          // hit goal
      else if (r < 84) count = Math.round(goal * 0.62);  // partial
      else             count = Math.round(goal * 0.28);  // missed
    }
    out[dateKey(d)] = count;
  }
  return out;
}

function seedTrainingHistory(): Record<string, DayType> {
  const out: Record<string, DayType> = {};
  const today = startOfToday();
  // 42 days (6 weeks) of attendance.
  for (let i = 0; i < 42; i++) {
    const d = addDays(today, -i);
    const r = (i * 29) % 100;
    let type: DayType;
    if (r < 55)      type = 'trained';
    else if (r < 78) type = 'rest';
    else if (r < 88) type = 'cheat';
    else             type = 'missed';
    out[dateKey(d)] = type;
  }
  return out;
}

function seedWaterLogs(): WaterLog[] {
  // Today's intake summing to 2.8 L, spread across a few entries.
  const now = new Date();
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3600_000).toISOString();
  return [
    { amountMl: 750, at: at(6) },
    { amountMl: 500, at: at(4) },
    { amountMl: 750, at: at(2) },
    { amountMl: 500, at: at(1) },
    { amountMl: 300, at: at(0) },
  ];
}

function seedWeightLogs(): WeightLog[] {
  // 8 weekly points trending down to 72.4 kg (latest = headline value).
  const today = startOfToday();
  const series = [74.8, 74.3, 73.9, 73.6, 73.1, 72.9, 72.6, 72.4];
  return series.map((weightKg, i) => ({
    weightKg,
    at: addDays(today, -(series.length - 1 - i) * 7).toISOString(),
  }));
}

function seedData(): BodyData {
  const stepsGoal = 20000;
  return {
    workoutsTotal: 142,
    stepsThisYear: 3_400_000,
    streak: 18,

    stepsGoal,
    stepsHistory: seedStepsHistory(stepsGoal),

    nextSession: { name: 'PULL DAY', when: 'TOMORROW', time: '18:00' },
    trainingHistory: seedTrainingHistory(),
    activeMovement: 'pull',
    templates: [
      {
        id: 'pull',
        name: 'PULL DAY',
        movement: 'pull',
        extraCount: 3,
        exercises: [
          {
            name: 'LAT PULLDOWN',
            icon: 'weight-lifter',
            pbDeltaKg: 5,
            sets: [
              { weightKg: 60, reps: 10 },
              { weightKg: 65, reps: 8 },
              { weightKg: 70, reps: 6 },
            ],
          },
          {
            name: 'SEATED ROW',
            icon: 'rowing',
            sets: [
              { weightKg: 65, reps: 12 },
              { weightKg: 65, reps: 10 },
              { weightKg: 60, reps: 10 },
            ],
          },
          {
            name: 'SINGLE ARM ROW',
            icon: 'arm-flex',
            sets: [
              { weightKg: 22.5, reps: 12 },
              { weightKg: 22.5, reps: 10 },
              { weightKg: 20, reps: 10 },
            ],
          },
        ],
      },
      { id: 'push',  name: 'PUSH DAY',  movement: 'push',  extraCount: 0, exercises: [] },
      { id: 'legs',  name: 'LEG DAY',   movement: 'legs',  extraCount: 0, exercises: [] },
      { id: 'upper', name: 'UPPER DAY', movement: 'upper', extraCount: 0, exercises: [] },
      { id: 'lower', name: 'LOWER DAY', movement: 'lower', extraCount: 0, exercises: [] },
    ],

    headlineLifts: [
      { name: 'BENCH PRESS', icon: 'weight-lifter', oneRmKg: 100, deltaKg: 5,    history: [88, 90, 92, 94, 95, 97, 99, 100] },
      { name: 'SQUAT',       icon: 'human-handsdown', oneRmKg: 140, deltaKg: 7.5, history: [120, 124, 128, 130, 133, 136, 138, 140] },
      { name: 'DEADLIFT',    icon: 'weight',          oneRmKg: 180, deltaKg: 10,  history: [155, 160, 163, 167, 170, 173, 176, 180] },
    ],

    weightLogs: seedWeightLogs(),
    weakestMuscle: { name: 'CHEST', pct: -12 },
    strengthTrend: { pct: 18, history: [100, 103, 106, 108, 111, 114, 116, 118] },

    sleepMins: 7 * 60 + 42,
    waterLogs: seedWaterLogs(),
    waterGoalMl: 3000,
    proteinTodayG: 148,
    proteinGoalG: 160,
  };
}

// ── Load / save ─────────────────────────────────────────────────────────────

export async function loadBodyData(): Promise<BodyData> {
  try {
    const raw = await AsyncStorage.getItem(BODY_KEY);
    if (raw) return JSON.parse(raw) as BodyData;
  } catch {
    // fall through to seed
  }
  const seeded = seedData();
  await AsyncStorage.setItem(BODY_KEY, JSON.stringify(seeded));
  return seeded;
}

async function save(data: BodyData): Promise<void> {
  await AsyncStorage.setItem(BODY_KEY, JSON.stringify(data));
}

// ── Mutations (the interactive trackers) ────────────────────────────────────

export async function addWater(amountMl: number): Promise<BodyData> {
  const data = await loadBodyData();
  data.waterLogs.push({ amountMl, at: new Date().toISOString() });
  await save(data);
  return data;
}

export async function logWeight(weightKg: number): Promise<BodyData> {
  const data = await loadBodyData();
  data.weightLogs.push({ weightKg, at: new Date().toISOString() });
  await save(data);
  return data;
}

// ── Derived / compute helpers ───────────────────────────────────────────────

export function todaySteps(d: BodyData): number {
  return d.stepsHistory[dateKey(startOfToday())] ?? 0;
}

// Builds a weeks×7 grid of dates, Monday→Sunday columns, today in the last row.
// Days after today (future) are returned as null so they render as blank.
export function buildDayGrid(weeks: number): (Date | null)[][] {
  const today = startOfToday();
  const mondayIdx = (today.getDay() + 6) % 7;            // Mon=0 … Sun=6
  const start = addDays(today, -mondayIdx - (weeks - 1) * 7);
  const grid: (Date | null)[][] = [];
  for (let w = 0; w < weeks; w++) {
    const row: (Date | null)[] = [];
    for (let c = 0; c < 7; c++) {
      const d = addDays(start, w * 7 + c);
      row.push(d > today ? null : d);
    }
    grid.push(row);
  }
  return grid;
}

export function stepsSquareState(d: BodyData, day: Date | null): SquareState {
  if (!day) return 'empty';
  const count = d.stepsHistory[dateKey(day)];
  if (count == null) return 'missed';
  const pct = count / d.stepsGoal;
  if (pct >= 1)    return 'hit';
  if (pct >= 0.5)  return 'partial';
  return 'missed';
}

export function trainingDayType(d: BodyData, day: Date | null): DayType | 'empty' {
  if (!day) return 'empty';
  return d.trainingHistory[dateKey(day)] ?? 'missed';
}

export function todayWaterMl(d: BodyData): number {
  const todayKey = dateKey(startOfToday());
  return d.waterLogs
    .filter(l => dateKey(new Date(l.at)) === todayKey)
    .reduce((sum, l) => sum + l.amountMl, 0);
}

export function latestWeight(d: BodyData): number {
  if (d.weightLogs.length === 0) return 0;
  return d.weightLogs[d.weightLogs.length - 1].weightKg;
}

export function weightHistory(d: BodyData, n = 8): number[] {
  return d.weightLogs.slice(-n).map(l => l.weightKg);
}

// Status label driven by % of goal hit (shared by water / protein / sleep).
export function goalStatus(pct: number): string {
  if (pct >= 1)    return 'GOOD';
  if (pct >= 0.8)  return 'ALMOST';
  if (pct >= 0.5)  return 'OK';
  return 'LOW';
}

export function formatSleep(mins: number): string {
  return `${Math.floor(mins / 60)}H ${mins % 60}M`;
}
