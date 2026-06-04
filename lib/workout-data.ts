// Workout data layer — templates, exercises, done log.
// Local-first: AsyncStorage is the primary store (instant, offline).
// Supabase is the cloud backup: every mutation fires-and-forgets a sync.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Get the logged-in user's ID (null if not signed in).
async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

// Fire-and-forget: run fn(), swallow any error (never blocks the caller).
function bg(fn: () => Promise<unknown>) {
  fn().catch(() => {});
}

const K = {
  templates: '@wk_templates',
  exercises: '@wk_exercises',
  junctions: '@wk_junctions',
  doneLog:   '@wk_done',
  pbs:       '@wk_pbs',       // PBEntry[]
};

// ── Types ──────────────────────────────────────────────────────────────────

export type MovementType = 'push' | 'pull' | 'legs' | 'upper' | 'lower' | 'cardio';
export type MuscleGroup  = 'chest' | 'back' | 'lats' | 'upper back' | 'traps' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs' | 'lower back' | 'hip flexors' | 'core' | 'cardio';

export type WorkoutTemplate = {
  id: string;
  name: string;
  colour: string;
  isArchived: boolean;
};

export type Exercise = {
  id: string;
  name: string;
  muscleGroups: MuscleGroup[];  // multiselect
  movementType: MovementType;
  sets: number;
  reps: string;
  weightKg: number;             // current working weight
};

// A logged personal-best weight for an exercise.
export type PBEntry = {
  id: string;
  exerciseId: string;
  weightKg: number;
  date: string;  // 'YYYY-M-D'
};

export type WorkoutExercise = {
  id: string;
  templateId: string;
  exerciseId: string;
  orderIndex: number;
};

export type DoneEntry = { date: string; templateId: string };

// ── ID helper ──────────────────────────────────────────────────────────────
export function genId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ── Storage helpers ────────────────────────────────────────────────────────
async function load<T>(key: string, fallback: T): Promise<T> {
  try { const r = await AsyncStorage.getItem(key); if (r) return JSON.parse(r); } catch {}
  return fallback;
}
async function save<T>(key: string, v: T) { await AsyncStorage.setItem(key, JSON.stringify(v)); }

// ── Seed ───────────────────────────────────────────────────────────────────
function buildSeed() {
  const exercises: Exercise[] = [
    { id: 'e-latpull',  name: 'LAT PULLDOWN',     muscleGroups: ['lats','back'],           movementType: 'pull', sets: 3, reps: '8-10',  weightKg: 60 },
    { id: 'e-srow',     name: 'SEATED ROW',        muscleGroups: ['back','lats'],           movementType: 'pull', sets: 3, reps: '10-12', weightKg: 65 },
    { id: 'e-sarow',    name: 'SINGLE ARM ROW',    muscleGroups: ['back'],                  movementType: 'pull', sets: 3, reps: '10-12', weightKg: 22.5 },
    { id: 'e-facepull', name: 'FACE PULL',         muscleGroups: ['shoulders','traps'],     movementType: 'pull', sets: 3, reps: '15',    weightKg: 20 },
    { id: 'e-bicurl',   name: 'BICEP CURL',        muscleGroups: ['biceps'],                movementType: 'pull', sets: 3, reps: '10-12', weightKg: 14 },
    { id: 'e-hamcurl',  name: 'HAMMER CURL',       muscleGroups: ['biceps','forearms'],     movementType: 'pull', sets: 3, reps: '10-12', weightKg: 16 },
    { id: 'e-bench',    name: 'BENCH PRESS',       muscleGroups: ['chest','triceps'],       movementType: 'push', sets: 4, reps: '5-8',   weightKg: 100 },
    { id: 'e-incline',  name: 'INCLINE DB PRESS',  muscleGroups: ['chest','shoulders'],     movementType: 'push', sets: 3, reps: '8-10',  weightKg: 34 },
    { id: 'e-ohp',      name: 'OHP',               muscleGroups: ['shoulders','triceps'],   movementType: 'push', sets: 3, reps: '6-8',   weightKg: 60 },
    { id: 'e-lateral',  name: 'LATERAL RAISE',     muscleGroups: ['shoulders'],             movementType: 'push', sets: 3, reps: '15',    weightKg: 10 },
    { id: 'e-tripdwn',  name: 'TRICEP PUSHDOWN',   muscleGroups: ['triceps'],               movementType: 'push', sets: 3, reps: '12',    weightKg: 30 },
    { id: 'e-squat',    name: 'SQUAT',             muscleGroups: ['quads','glutes'],         movementType: 'legs', sets: 4, reps: '5',     weightKg: 140 },
    { id: 'e-rdl',      name: 'ROMANIAN DEADLIFT', muscleGroups: ['hamstrings','glutes'],   movementType: 'legs', sets: 3, reps: '8-10',  weightKg: 100 },
    { id: 'e-legpress', name: 'LEG PRESS',         muscleGroups: ['quads','glutes'],         movementType: 'legs', sets: 3, reps: '10-12', weightKg: 180 },
    { id: 'e-legcurl',  name: 'LEG CURL',          muscleGroups: ['hamstrings'],             movementType: 'legs', sets: 3, reps: '12',    weightKg: 40 },
    { id: 'e-calf',     name: 'CALF RAISE',        muscleGroups: ['calves'],                 movementType: 'legs', sets: 4, reps: '15',    weightKg: 60 },
    { id: 'e-dead',     name: 'DEADLIFT',          muscleGroups: ['back','hamstrings','glutes'], movementType: 'lower', sets: 3, reps: '3-5', weightKg: 180 },
  ];

  const templates: WorkoutTemplate[] = [
    { id: 't-pull', name: 'PULL DAY',  colour: '#FF4D00', isArchived: false },
    { id: 't-push', name: 'PUSH DAY',  colour: '#4A90D9', isArchived: false },
    { id: 't-legs', name: 'LEGS DAY',  colour: '#4CAF50', isArchived: false },
  ];

  const junctions: WorkoutExercise[] = [
    { id: genId(), templateId: 't-pull', exerciseId: 'e-latpull',  orderIndex: 0 },
    { id: genId(), templateId: 't-pull', exerciseId: 'e-srow',     orderIndex: 1 },
    { id: genId(), templateId: 't-pull', exerciseId: 'e-sarow',    orderIndex: 2 },
    { id: genId(), templateId: 't-pull', exerciseId: 'e-facepull', orderIndex: 3 },
    { id: genId(), templateId: 't-pull', exerciseId: 'e-bicurl',   orderIndex: 4 },
    { id: genId(), templateId: 't-pull', exerciseId: 'e-hamcurl',  orderIndex: 5 },
    { id: genId(), templateId: 't-push', exerciseId: 'e-bench',    orderIndex: 0 },
    { id: genId(), templateId: 't-push', exerciseId: 'e-incline',  orderIndex: 1 },
    { id: genId(), templateId: 't-push', exerciseId: 'e-ohp',      orderIndex: 2 },
    { id: genId(), templateId: 't-push', exerciseId: 'e-lateral',  orderIndex: 3 },
    { id: genId(), templateId: 't-push', exerciseId: 'e-tripdwn',  orderIndex: 4 },
    { id: genId(), templateId: 't-legs', exerciseId: 'e-squat',    orderIndex: 0 },
    { id: genId(), templateId: 't-legs', exerciseId: 'e-rdl',      orderIndex: 1 },
    { id: genId(), templateId: 't-legs', exerciseId: 'e-legpress', orderIndex: 2 },
    { id: genId(), templateId: 't-legs', exerciseId: 'e-legcurl',  orderIndex: 3 },
    { id: genId(), templateId: 't-legs', exerciseId: 'e-calf',     orderIndex: 4 },
  ];

  return { exercises, templates, junctions };
}

export async function ensureSeeded() {
  const existing = await load<WorkoutTemplate[]>(K.templates, []);
  if (existing.length > 0) return;
  const { exercises, templates, junctions } = buildSeed();
  await Promise.all([
    save(K.templates, templates),
    save(K.exercises, exercises),
    save(K.junctions, junctions),
    save(K.doneLog, []),
  ]);
}

// ── Reads ──────────────────────────────────────────────────────────────────
export const getTemplates = () => load<WorkoutTemplate[]>(K.templates, []);
export const getExercises = () => load<Exercise[]>(K.exercises, []);
export const getJunctions = () => load<WorkoutExercise[]>(K.junctions, []);
export const getDoneLog   = () => load<DoneEntry[]>(K.doneLog, []);

export async function getTemplateExercises(templateId: string): Promise<Exercise[]> {
  const [exercises, junctions] = await Promise.all([getExercises(), getJunctions()]);
  const map = Object.fromEntries(exercises.map(e => [e.id, e]));
  return junctions
    .filter(j => j.templateId === templateId)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(j => map[j.exerciseId])
    .filter(Boolean);
}

// Was this template done today?
export async function isDoneToday(templateId: string): Promise<boolean> {
  const log = await getDoneLog();
  return log.some(e => e.templateId === templateId && e.date === todayKey());
}

// ── Mutations (each saves locally then syncs to Supabase in background) ───────

export async function createTemplate(name: string, colour: string): Promise<WorkoutTemplate> {
  const templates = await getTemplates();
  const t: WorkoutTemplate = { id: genId(), name: name.toUpperCase(), colour, isArchived: false };
  await save(K.templates, [...templates, t]);
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('workout_templates').upsert({ id: t.id, user_id: userId, name: t.name, colour: t.colour, is_archived: false });
  });
  return t;
}

export async function archiveTemplate(id: string): Promise<void> {
  const templates = await getTemplates();
  await save(K.templates, templates.map(t => t.id === id ? { ...t, isArchived: true } : t));
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('workout_templates').update({ is_archived: true }).eq('id', id).eq('user_id', userId);
  });
}

export async function createExercise(data: Omit<Exercise, 'id'>): Promise<Exercise> {
  const exercises = await getExercises();
  const e: Exercise = { ...data, id: genId() };
  await save(K.exercises, [...exercises, e]);
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('exercises').upsert({ id: e.id, user_id: userId, name: e.name, muscle_groups: e.muscleGroups, movement_type: e.movementType, sets: e.sets, reps: e.reps, weight_kg: e.weightKg });
  });
  return e;
}

export async function updateExercise(
  id: string,
  patch: Partial<Pick<Exercise, 'name' | 'muscleGroups' | 'movementType' | 'sets' | 'reps' | 'weightKg'>>,
): Promise<void> {
  const exercises = await getExercises();
  await save(K.exercises, exercises.map(e => e.id === id ? { ...e, ...patch } : e));
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    const row: Record<string, unknown> = {};
    if (patch.name        != null) row.name          = patch.name;
    if (patch.muscleGroups!= null) row.muscle_groups = patch.muscleGroups;
    if (patch.movementType!= null) row.movement_type = patch.movementType;
    if (patch.sets        != null) row.sets           = patch.sets;
    if (patch.reps        != null) row.reps           = patch.reps;
    if (patch.weightKg    != null) row.weight_kg      = patch.weightKg;
    if (Object.keys(row).length > 0) await supabase.from('exercises').update(row).eq('id', id).eq('user_id', userId);
  });
}

export async function addExerciseToTemplate(templateId: string, exerciseId: string): Promise<void> {
  const junctions = await getJunctions();
  const count = junctions.filter(j => j.templateId === templateId).length;
  const j = { id: genId(), templateId, exerciseId, orderIndex: count };
  await save(K.junctions, [...junctions, j]);
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('workout_exercises').upsert({ id: j.id, user_id: userId, workout_template_id: templateId, exercise_id: exerciseId, order_index: count });
  });
}

export async function removeExerciseFromTemplate(junctionId: string): Promise<void> {
  const junctions = await getJunctions();
  await save(K.junctions, junctions.filter(j => j.id !== junctionId));
  bg(async () => {
    await supabase.from('workout_exercises').delete().eq('id', junctionId);
  });
}

export async function markDoneToday(templateId: string): Promise<void> {
  const log = await getDoneLog();
  const today = todayKey();
  const filtered = log.filter(e => !(e.templateId === templateId && e.date === today));
  const entry = { id: genId(), templateId, date: today };
  await save(K.doneLog, [...filtered, { date: today, templateId }]);
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('workout_done_log').upsert({ id: entry.id, user_id: userId, workout_template_id: templateId, date: today });
  });
}

export async function unmarkDoneToday(templateId: string): Promise<void> {
  const today = todayKey();
  const log = await getDoneLog();
  await save(K.doneLog, log.filter(e => !(e.templateId === templateId && e.date === today)));
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('workout_done_log').delete().eq('user_id', userId).eq('workout_template_id', templateId).eq('date', today);
  });
}

// ── PB tracking ────────────────────────────────────────────────────────────

export const getPBLog = () => load<PBEntry[]>(K.pbs, []);

export async function getPBHistory(exerciseId: string): Promise<PBEntry[]> {
  const log = await getPBLog();
  return log.filter(e => e.exerciseId === exerciseId).sort((a, b) => a.date.localeCompare(b.date));
}

export async function logPB(exerciseId: string, weightKg: number): Promise<PBEntry> {
  const log  = await getPBLog();
  const date = todayKey();
  const filtered = log.filter(e => !(e.exerciseId === exerciseId && e.date === date));
  const entry: PBEntry = { id: genId(), exerciseId, weightKg, date };
  await save(K.pbs, [...filtered, entry]);
  bg(async () => {
    const userId = await uid();
    if (!userId) return;
    await supabase.from('pb_log').upsert({ id: entry.id, user_id: userId, exercise_id: exerciseId, weight_kg: weightKg, date });
  });
  return entry;
}

export async function deletePB(pbId: string): Promise<void> {
  const log = await getPBLog();
  await save(K.pbs, log.filter(e => e.id !== pbId));
  bg(async () => {
    await supabase.from('pb_log').delete().eq('id', pbId);
  });
}
