// Everything the twin (lib/twin.ts) reads, gathered for TODAY, plus the goal
// store. After each build the day's targets are written back into the stores
// the rest of the app reads — steps and water on the body blob, food on
// nutrition_targets — so BODY, STEPS and CALORIES show the twin's numbers.
// The last view is cached so TODAY opens on numbers, not a spinner.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadCoach } from './routine';
import { getBodyProfile, latestWeight, setDailyGoals, todaySteps, todayWaterMl, dateKey } from './body-data';
import { getMealsForDate, dailyTotals, getTargets, saveTargets } from './meals-data';
import { getRecentSleepLogs } from './sleep-data';
import { getActivitiesInRange } from './activity-data';
import { getExercises, getTemplateExercises, getTemplates } from './workout-data';
import { FOCUS_LINEUP, focusOfName, planSession, type Today } from './coach';
import { buildTwin, DEFAULT_GOAL, type Twin, type TwinGoal, type TwinInput } from './twin';

const GOAL_KEY = '@twin_goal';
const VIEW_KEY = '@twin_view';

export async function getGoal(): Promise<TwinGoal> {
  try {
    const raw = await AsyncStorage.getItem(GOAL_KEY);
    if (raw) return { ...DEFAULT_GOAL, ...JSON.parse(raw) };
  } catch { /* fall through */ }
  return DEFAULT_GOAL;
}

export async function setGoal(g: TwinGoal): Promise<void> {
  await AsyncStorage.setItem(GOAL_KEY, JSON.stringify(g));
}

/** What TODAY draws: the twin, the coach's day and where today's numbers stand. */
export type TodayView = {
  twin: Twin;
  today: Today;
  lifts: number;
  resting: number;
  now: {
    steps: number; waterMl: number; kcal: number; proteinG: number; carbsG: number; fatG: number;
    sleepMin: number | null; activeKcal: number | null; activeMin: number | null;
    rhr: number | null; hrv: number | null; weightKg: number | null; weightDelta: number | null;
  };
  healthConnected: boolean;
  wearable: boolean;
  at: number;
};

export async function cachedView(): Promise<TodayView | null> {
  try {
    const raw = await AsyncStorage.getItem(VIEW_KEY);
    const v = raw ? (JSON.parse(raw) as TodayView) : null;
    // Yesterday's plan is no plan for today.
    return v && dateKey(new Date(v.at)) === dateKey(new Date()) ? v : null;
  } catch { return null; }
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

/** Reads everything, builds the twin, writes today's targets back. `input` is kept for live goal previews. */
export async function loadToday(): Promise<{ view: TodayView; input: TwinInput }> {
  const now = new Date();
  const back = (d: number) => dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - d));
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 8).toISOString();
  const [coach, goal, profile, sleepLogs, activities, meals] = await Promise.all([
    loadCoach(),
    getGoal(),
    getBodyProfile(),
    getRecentSleepLogs(14),
    getActivitiesInRange(since, new Date(now.getTime() + 60_000).toISOString()).catch(() => []),
    Promise.all(Array.from({ length: 8 }, (_, d) => getMealsForDate(back(d)).then(m => [back(d), m] as const))),
  ]);
  const body = coach.body;

  const water: Record<string, number> = {};
  for (const l of body.waterLogs) { const k = dateKey(new Date(l.at)); water[k] = (water[k] ?? 0) + l.amountMl; }
  const eaten: Record<string, number> = {};
  for (const [k, m] of meals) if (m.length) eaten[k] = dailyTotals(m).calories;
  // Sleep: the wearable's night, else the logged one; last night falls back to Health's figure.
  const sleep: Record<string, number> = {};
  for (const l of sleepLogs) if (l.totalHours) sleep[l.date] = l.totalHours * 60;
  for (const [k, n] of Object.entries(body.vitals?.sleep ?? {})) if (n.asleep > 0) sleep[k] = n.asleep;
  if (sleep[back(0)] == null && body.sleepMins) sleep[back(0)] = body.sleepMins;
  const wakeMin = median(sleepLogs.map(l => l.wakeTime).filter((t): t is string => !!t).map(toMin));
  const runsKm: Record<string, number> = {};
  const addRun = (end: number, m: number) => { const k = dateKey(new Date(end)); runsKm[k] = (runsKm[k] ?? 0) + m / 1000; };
  for (const a of activities) if (a.type === 'run') addRun(Date.parse(a.endTime), a.distanceM);
  for (const r of body.runs ?? []) addRun(r.end, r.distanceM);

  const input: TwinInput = {
    now, goal,
    profile: { age: profile.age ?? null, sex: profile.sex, heightCm: profile.heightCm, weightKg: profile.weightKg, goalWeightKg: profile.goalWeightKg ?? null },
    weights: body.weightLogs.map(w => ({ kg: w.weightKg, at: w.at })),
    steps: body.stepsHistory, water, eaten, sleep,
    wake: wakeMin == null ? null : `${String(Math.floor(wakeMin / 60)).padStart(2, '0')}:${String(wakeMin % 60).padStart(2, '0')}`,
    runsKm, coach: coach.today, routine: coach.routine, sessions: coach.sessions,
  };
  const twin = buildTwin(input);

  // Today's session: your template for the focus, else the starter lineup; lifts on tired muscles rest.
  const t = (await getTemplates()).filter(x => !x.isArchived).find(x => focusOfName(x.name) === coach.today.focus);
  const lib = await getExercises();
  const lineup = t ? await getTemplateExercises(t.id)
    : FOCUS_LINEUP[coach.today.focus].map(name => lib.find(e => e.name === name) ?? { name, muscleGroups: [] });
  const plan = planSession(lineup, coach.sessions, coach.today.at);

  const todayTotals = dailyTotals(meals[0][1]);
  const weighIns = [...body.weightLogs].sort((a, b) => a.at.localeCompare(b.at));
  const weekAgo = weighIns.filter(w => Date.parse(w.at) <= now.getTime() - 6 * 86_400_000).pop();
  const kg = latestWeight(body) || null;
  const vit = body.vitals;
  const view: TodayView = {
    twin, today: coach.today, lifts: plan.keep.length, resting: plan.rest.length,
    now: {
      steps: todaySteps(body), waterMl: todayWaterMl(body), kcal: todayTotals.calories, proteinG: todayTotals.proteinG, carbsG: todayTotals.carbsG, fatG: todayTotals.fatG,
      sleepMin: sleep[back(0)] ?? null,
      activeKcal: body.activityToday?.caloriesKcal ?? null, activeMin: body.activityToday?.activeMinutes ?? null,
      rhr: vit?.rhr[back(0)] ?? vit?.rhr[back(1)] ?? null,
      hrv: vit?.hrv[back(0)] ?? vit?.hrv[back(1)] ?? (body.heart?.hrvAt && Date.parse(body.heart.hrvAt) > now.getTime() - 2 * 86_400_000 ? body.heart.hrvMs : null),
      weightKg: kg, weightDelta: kg && weekAgo ? Math.round((kg - weekAgo.weightKg) * 10) / 10 : null,
    },
    healthConnected: !!body.appleHealthConnected,
    wearable: coach.today.readiness.factors.length > 1,
    at: now.getTime(),
  };
  void AsyncStorage.setItem(VIEW_KEY, JSON.stringify(view)).catch(() => {});
  void applyTargets(twin);
  return { view, input };
}

/** Writes today's targets where the rest of the app reads them — only when they changed. */
async function applyTargets(twin: Twin): Promise<void> {
  await setDailyGoals(twin.steps.value, twin.water.value);
  const cur = await getTargets();
  const next = { calories: twin.fuel.value, proteinG: twin.fuel.proteinG, carbsG: twin.fuel.carbsG, fatG: twin.fuel.fatG, waterMl: twin.water.value };
  if ((Object.keys(next) as (keyof typeof next)[]).some(k => cur[k] !== next[k])) await saveTargets(next);
}
