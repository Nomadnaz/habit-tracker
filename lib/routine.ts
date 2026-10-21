// Routine store + everything the coach (lib/coach.ts) needs, gathered in one
// place for TRAIN and LOG WORKOUT. Local-first like the rest: the routine
// lives in AsyncStorage, and saving it rewrites the week plan (gym_plan) so
// BODY's UP NEXT lens and the server see the same week.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addExerciseToTemplate, createExercise, createTemplate, ensureSeeded, getDoneLog, getExercises, getGymPlan,
  getPBLog, getTemplates, getTrainingSessions, setGymPlan, updateExercise,
  type Exercise, type Focus, type GymPlan, type MovementType, type MuscleGroup,
} from './workout-data';
import {
  coachToday, focusOfName, FOCUS_LINEUP, FOCUS_TITLE, WEEK, weekPlan,
  type Routine, type Today, type Vitals,
} from './coach';
import { CATALOGUE, cardioSessions, withIntensity, type Session } from './muscle-recovery';
import { loadBodyData, getBodyProfile, latestWeight, type BodyData } from './body-data';
import { getActivitiesInRange } from './activity-data';
import { equipmentOf, guideFor, patternOf } from './exercise-guide';
import { findExercise } from './exercise-library';

const KEY = '@routine';

/** The saved routine; else one read off an existing week plan; else null (not set up). */
export async function getRoutine(): Promise<Routine | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  const plan = await getGymPlan();
  const days = WEEK.filter(d => plan[d] && plan[d] !== 'rest' && plan[d] !== 'cheat');
  const cheat = WEEK.filter(d => plan[d] === 'cheat');
  return days.length ? { days, split: 'auto', ...(cheat.length ? { cheat } : {}) } : null;
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
  body: BodyData;
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
  return { routine, today, sessions, vitals: body.vitals, body };
}

// ── a template per focus ──────────────────────────────────────────────────

const MOVE_OF_GROUP: Partial<Record<MuscleGroup, MovementType>> = {
  chest: 'push', shoulders: 'push', triceps: 'push',
  back: 'pull', lats: 'pull', 'upper back': 'pull', traps: 'pull', biceps: 'pull', forearms: 'pull',
  quads: 'legs', hamstrings: 'legs', glutes: 'legs', calves: 'legs',
};

/** An exercise for a catalogue name: yours if you have that lift (same name, or same movement on the
 *  same kit), else a new one with a starting weight for your size. */
export async function exerciseFor(name: string, groups?: MuscleGroup[], opts: { exact?: boolean } = {}): Promise<Exercise> {
  const library = await getExercises();
  const known = findExercise(name);
  const key = known?.name ?? name.toUpperCase();
  const pattern = patternOf(key), kit = equipmentOf(key, pattern);
  // Yours by name, or by being the same lift in the library ("PEC FLY" is your PEC DECK).
  // A starter lineup may also borrow one on the same movement and kit; a logged set
  // (`exact`) never does — an incline press is not your flat one.
  const mine = library.find(e => e.name.toUpperCase() === name.toUpperCase() || e.name.toUpperCase() === key)
    ?? (known ? library.find(e => findExercise(e.name) === known) : undefined)
    ?? (opts.exact ? undefined : library.find(e => patternOf(e.name) === pattern && equipmentOf(e.name, pattern) === kit && pattern !== 'stand'));
  if (mine) return mine;
  const muscleGroups = groups?.length ? groups : known?.groups ?? CATALOGUE.find(([n]) => n === key)?.[1] ?? [];
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

// ── the starter library's numbers ────────────────────────────────────────

// What the seed (lib/workout-data.ts buildSeed) shipped with — placeholder
// numbers (a 100 kg bench, a 180 kg deadlift), not anyone's working weights.
const SEED: Record<string, { sets: number; reps: string; weightKg: number }> = {
  'e-latpull': { sets: 3, reps: '8-10', weightKg: 60 }, 'e-srow': { sets: 3, reps: '10-12', weightKg: 65 },
  'e-sarow': { sets: 3, reps: '10-12', weightKg: 22.5 }, 'e-facepull': { sets: 3, reps: '15', weightKg: 20 },
  'e-bicurl': { sets: 3, reps: '10-12', weightKg: 14 }, 'e-hamcurl': { sets: 3, reps: '10-12', weightKg: 16 },
  'e-bench': { sets: 4, reps: '5-8', weightKg: 100 }, 'e-incline': { sets: 3, reps: '8-10', weightKg: 34 },
  'e-ohp': { sets: 3, reps: '6-8', weightKg: 60 }, 'e-lateral': { sets: 3, reps: '15', weightKg: 10 },
  'e-tripdwn': { sets: 3, reps: '12', weightKg: 30 }, 'e-squat': { sets: 4, reps: '5', weightKg: 140 },
  'e-rdl': { sets: 3, reps: '8-10', weightKg: 100 }, 'e-legpress': { sets: 3, reps: '10-12', weightKg: 180 },
  'e-legcurl': { sets: 3, reps: '12', weightKg: 40 }, 'e-calf': { sets: 4, reps: '15', weightKg: 60 },
  'e-dead': { sets: 3, reps: '3-5', weightKg: 180 },
};

/** Best estimated 1RM per exercise from real (puck-measured) sets. */
export function bestE1rms(sessions: Session[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of sessions) {
    if (!s.measured || s.weightKg <= 0 || findExercise(s.name)?.assisted) continue;
    const e = s.weightKg * (1 + (s.reps ?? 1) / 30);
    if (e > (out[s.exerciseId] ?? 0)) out[s.exerciseId] = e;
  }
  return out;
}

/** Starter lifts still on their placeholder numbers, untouched and never logged, get the
 *  guide's sets × reps and starting weight for this body (or your puck history). */
export async function recalibrateStarterLifts(sessions: Session[]): Promise<number> {
  const [library, pbs, profile, body] = await Promise.all([getExercises(), getPBLog(), getBodyProfile(), loadBodyData()]);
  const bodyKg = latestWeight(body) || profile.weightKg;
  const best = bestE1rms(sessions);
  let changed = 0;
  for (const ex of library) {
    const seed = SEED[ex.id];
    if (!seed || ex.sets !== seed.sets || ex.reps !== seed.reps || ex.weightKg !== seed.weightKg) continue;
    if (pbs.some(p => p.exerciseId === ex.id)) continue;
    const g = guideFor(ex.name, { goal: 'size', bodyKg, heightCm: profile.heightCm, sex: profile.sex, bestE1rmKg: best[ex.id] });
    if (g.startKg == null && g.equipment !== 'bodyweight') continue; // no bodyweight to size it from yet
    await updateExercise(ex.id, { sets: g.sets, reps: `${g.reps[0]}-${g.reps[1]}`, weightKg: g.startKg ?? 0 });
    changed++;
  }
  return changed;
}
