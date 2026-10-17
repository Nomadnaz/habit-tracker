// Routine store + everything the coach (lib/coach.ts) needs, gathered in one
// place for TRAIN and LOG WORKOUT. Local-first like the rest: the routine
// lives in AsyncStorage, and saving it rewrites the week plan (gym_plan) so
// BODY's UP NEXT lens and the server see the same week.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addExerciseToTemplate, createExercise, createTemplate, ensureSeeded, getDoneLog, getExercises, getGymPlan,
  getTemplates, getTrainingSessions, setGymPlan,
  type Exercise, type Focus, type GymPlan, type MovementType, type MuscleGroup,
} from './workout-data';
import {
  coachToday, focusOfName, FOCUS_LINEUP, FOCUS_TITLE, WEEK, weekPlan,
  type Routine, type Today, type Vitals,
} from './coach';
import { CATALOGUE, cardioSessions, withIntensity, type Session } from './muscle-recovery';
import { loadBodyData, getBodyProfile, latestWeight } from './body-data';
import { getActivitiesInRange } from './activity-data';
import { equipmentOf, guideFor, patternOf } from './exercise-guide';

const KEY = '@routine';

/** The saved routine; else one read off an existing week plan; else null (not set up). */
export async function getRoutine(): Promise<Routine | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  const plan = await getGymPlan();
  const days = WEEK.filter(d => plan[d] && plan[d] !== 'rest' && plan[d] !== 'cheat');
  return days.length ? { days, split: 'auto' } : null;
}

export async function saveRoutine(r: Routine): Promise<GymPlan> {
  await AsyncStorage.setItem(KEY, JSON.stringify(r));
  return setGymPlan(weekPlan(r));
}

export type CoachState = {
  routine: Routine | null;
  today: Today;
  sessions: Session[];
  vitals: Vitals | undefined;
};

/** Training (lifts weighted by how heavy, plus runs and big walking days) and wearable numbers → today. */
export async function loadCoach(): Promise<CoachState> {
  await ensureSeeded();
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const [routine, body, lifts, appRuns, done, templates] = await Promise.all([
    getRoutine(),
    loadBodyData(),
    getTrainingSessions().catch(() => [] as Session[]),
    getActivitiesInRange(since, new Date(Date.now() + 60_000).toISOString()).catch(() => []),
    getDoneLog(),
    getTemplates(),
  ]);
  // Taken after the reads: a session just ticked off is stamped "now" by
  // getTrainingSessions, and an earlier clock would see it as in the future and skip it.
  const now = new Date();
  const runs = [
    ...(body.runs ?? []),
    ...appRuns.filter(a => a.type === 'run').map(a => ({ start: Date.parse(a.startTime), end: Date.parse(a.endTime), distanceM: a.distanceM })),
  ];
  const sessions = [...withIntensity(lifts), ...cardioSessions(body.stepsHistory, runs, now.getTime())];
  const name = Object.fromEntries(templates.map(t => [t.id, t.name]));
  const doneFoci = done
    .map(d => ({ focus: focusOfName(name[d.templateId] ?? ''), date: d.date }))
    .filter((d): d is { focus: Focus; date: string } => d.focus != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  const today = coachToday({ routine: routine ?? { days: [], split: 'auto' }, doneFoci, sessions, vitals: body.vitals, now });
  return { routine, today, sessions, vitals: body.vitals };
}

// ── a template per focus ──────────────────────────────────────────────────

const MOVE_OF_GROUP: Partial<Record<MuscleGroup, MovementType>> = {
  chest: 'push', shoulders: 'push', triceps: 'push',
  back: 'pull', lats: 'pull', 'upper back': 'pull', traps: 'pull', biceps: 'pull', forearms: 'pull',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
};

/** An exercise for a catalogue name: yours if you have that lift (same name, or same movement on the
 *  same kit), else a new one with a starting weight for your size. */
export async function exerciseFor(name: string, groups?: MuscleGroup[]): Promise<Exercise> {
  const library = await getExercises();
  const key = name.toUpperCase();
  const pattern = patternOf(key), kit = equipmentOf(key, pattern);
  const mine = library.find(e => e.name.toUpperCase() === key)
    ?? library.find(e => patternOf(e.name) === pattern && equipmentOf(e.name, pattern) === kit && pattern !== 'stand');
  if (mine) return mine;
  const muscleGroups = groups ?? CATALOGUE.find(([n]) => n === key)?.[1] ?? [];
  const [profile, body] = await Promise.all([getBodyProfile(), loadBodyData()]);
  const g = guideFor(key, { goal: 'size', bodyKg: latestWeight(body) || profile.weightKg, heightCm: profile.heightCm, sex: profile.sex });
  return createExercise({
    name: key, muscleGroups,
    movementType: MOVE_OF_GROUP[muscleGroups[0]] ?? 'lower',
    sets: g.sets, reps: `${g.reps[0]}-${g.reps[1]}`, weightKg: g.startKg ?? 0,
  });
}

/** The template for a focus ("PUSH DAY"), made with a starter lineup the first time. */
export async function ensureFocusTemplate(focus: Focus): Promise<string> {
  const live = (await getTemplates()).filter(t => !t.isArchived);
  const have = live.find(t => focusOfName(t.name) === focus);
  if (have) return have.id;
  const t = await createTemplate(FOCUS_TITLE[focus], '#FFFFFF');
  const added = new Set<string>();
  for (const name of FOCUS_LINEUP[focus]) {
    const ex = await exerciseFor(name);
    if (added.has(ex.id)) continue;
    added.add(ex.id);
    await addExerciseToTemplate(t.id, ex.id);
  }
  return t.id;
}
