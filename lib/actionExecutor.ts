// ─────────────────────────────────────────────────────────────────────────
// lib/actionExecutor.ts — client-side action execution (tasks 012 + 039)
//
// The ai-chat Edge Function GATES each action (auto / preview / clarify /
// unsupported) but does NOT write anything — because this app is LOCAL-FIRST.
// A task only "exists" once it's in on-device storage (@tasks); the manual
// "ADD TASK" flow also mirrors it to Supabase and Apple Calendar/Reminders.
//
// So when the AI wants to create / reschedule / complete a task, we run the
// SAME local-first path here, which means AI-created tasks show up in the app
// instantly and sync to Apple — exactly like ones you add by hand.
//
//   executeAction(action) — perform one gated action locally. Used for both
//   high-confidence ('auto') actions and PreviewCard confirmations.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { postWrite } from './postWrite';
import { toDateKey } from './dateKey';
import {
  generateTaskId,
  insertNewActiveTask,
  sortActiveTasks,
  type Priority,
  type Task,
  type TaskMap,
} from './tasks-core';
import { taskToDbRow } from './task-supabase';
import {
  mergeAppleIdsIntoTaskMap,
  syncNewTaskToApple,
  syncTaskScheduleToApple,
  syncTaskDoneToApple,
} from './apple-sync';
import { findTaskDateKey, moveTaskInMap } from './task-schedule';
import { genId } from './workout-data';

export type ActionStatus = 'auto' | 'preview' | 'clarify' | 'unsupported' | 'executed' | 'failed';

export interface ProcessedAction {
  type: string;
  data?: Record<string, any>;
  confidence?: number;
  status: ActionStatus;
  message?: string;
  result?: Record<string, any>;
}

const TASKS_KEY = '@tasks';

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;
const numOrUndef = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

// Epley formula — see supabase/functions/_shared/actionExecutor.ts for why
// raw weight_kg is the wrong PB test once reps vary. Kept in sync with that
// server-side copy (mirrors the same log_pb/log_set contract for the
// gated-'auto' path, which the app executes locally rather than server-side).
const estimated1RM = (weightKg: number, reps: number): number =>
  weightKg * (1 + Math.max(0, reps) / 30);

async function bestEstimated1RM(userId: string, exerciseId: string): Promise<number> {
  const [pbRes, setsRes] = await Promise.all([
    supabase.from('pb_log').select('weight_kg, reps').eq('user_id', userId).eq('exercise_id', exerciseId),
    supabase.from('exercise_sets').select('estimated_1rm_kg').eq('user_id', userId).eq('exercise_id', exerciseId),
  ]);
  const fromPbs = (pbRes.data ?? []).map((r: { weight_kg: number; reps: number | null }) =>
    estimated1RM(r.weight_kg, r.reps ?? 1));
  const fromSets = (setsRes.data ?? []).map((r: { estimated_1rm_kg: number }) => r.estimated_1rm_kg);
  return Math.max(0, ...fromPbs, ...fromSets);
}

function priorityOf(v: unknown): Priority {
  const p = str(v)?.toUpperCase();
  return p === 'HIGH' || p === 'LOW' || p === 'MEDIUM' ? (p as Priority) : 'MEDIUM';
}

/** Resolve a model-supplied date into a canonical local date key. */
function resolveDateKey(v: unknown): string {
  const s = str(v)?.toLowerCase();
  const now = new Date();
  if (!s || s === 'today') return toDateKey(now);
  if (s === 'tomorrow') {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toDateKey(d);
  }
  // Already a YYYY-MM-DD key? Trust it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return toDateKey(now);
}

async function readMap(): Promise<TaskMap> {
  const raw = await AsyncStorage.getItem(TASKS_KEY);
  return raw ? (JSON.parse(raw) as TaskMap) : {};
}

async function writeMap(map: TaskMap): Promise<void> {
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(map));
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Execute a single gated action through the app's local-first flow.
 * Mirrors the manual add/edit path in app/calendar/day.tsx. Throws on failure
 * so the caller (ChatScreen) can surface it.
 */
export async function executeAction(action: ProcessedAction): Promise<{ summary: string }> {
  const data = action.data ?? {};
  const userId = await currentUserId();

  switch (action.type) {
    case 'create_task': {
      const rawLabel = str(data.label) ?? str(data.title) ?? str(data.name);
      if (!rawLabel) throw new Error("I couldn't tell what the task should be called.");
      const label = rawLabel.toUpperCase();
      const dateKey = resolveDateKey(data.date);
      const hour = numOrUndef(data.hour);
      const minute = numOrUndef(data.minute);
      const location = str(data.location)?.toUpperCase();
      const priority = priorityOf(data.priority);

      const task: Task = {
        id: generateTaskId(),
        label,
        done: false,
        archived: false,
        priority,
        hour,
        minute,
        location,
      };

      // 1. Local-first: write into on-device @tasks so the UI shows it now.
      const map = await readMap();
      const day = map[dateKey] ?? [];
      const active = day.filter(t => !t.archived);
      const archived = day.filter(t => t.archived);
      await writeMap({ ...map, [dateKey]: [...insertNewActiveTask(active, task), ...archived] });

      // 2. Mirror to Supabase (fire-and-forget, matches the manual flow).
      if (userId) void supabase.from('tasks').insert(taskToDbRow(task, dateKey, userId));

      // 3. Apple Calendar + Reminders, then merge the returned ids back in.
      const ids = await syncNewTaskToApple({
        label,
        dateKey,
        mode: 'reminders-and-calendar',
        hour,
        minute,
        location,
        priority,
      });
      if (ids.appleReminderId || ids.appleEventId) {
        await writeMap(mergeAppleIdsIntoTaskMap(await readMap(), dateKey, task.id, ids));
      }

      // date included (Task itself has no date field — dateKey is the day-map
      // key) so lib/obsidian.ts's vault writer can file this under the right
      // Daily Note.
      await postWrite('task', { ...task, date: dateKey }, 'create');
      const when = hour != null ? ` at ${String(hour).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}` : '';
      return { summary: `Added "${label}" for ${dateKey}${when}` };
    }

    case 'reschedule_task': {
      const taskId = str(data.taskId) ?? str(data.id);
      if (!taskId) throw new Error("I couldn't tell which task to reschedule.");
      const map = await readMap();
      const fromKey = findTaskDateKey(map, taskId);
      if (!fromKey) throw new Error("I couldn't find that task on your calendar.");
      const existing = (map[fromKey] ?? []).find(t => t.id === taskId)!;
      const toKey = data.date != null ? resolveDateKey(data.date) : fromKey;
      const patch: Partial<Task> = {};
      if (numOrUndef(data.hour) !== undefined) patch.hour = numOrUndef(data.hour);
      if (numOrUndef(data.minute) !== undefined) patch.minute = numOrUndef(data.minute);
      if (str(data.priority)) patch.priority = priorityOf(data.priority);

      const newMap = moveTaskInMap(map, fromKey, toKey, taskId, patch, sortActiveTasks);
      await writeMap(newMap);
      const updated = (newMap[toKey] ?? []).find(t => t.id === taskId) ?? { ...existing, ...patch };
      if (userId) void supabase.from('tasks').update(taskToDbRow(updated, toKey, userId)).eq('id', taskId);
      void syncTaskScheduleToApple(updated, { dateKey: toKey });

      await postWrite('task', { ...updated, date: toKey }, 'update');
      return { summary: `Moved "${existing.label}" to ${toKey}` };
    }

    case 'complete_task': {
      const taskId = str(data.taskId) ?? str(data.id);
      if (!taskId) throw new Error("I couldn't tell which task to complete.");
      const map = await readMap();
      const dateKey = findTaskDateKey(map, taskId);
      if (!dateKey) throw new Error("I couldn't find that task on your calendar.");
      const day = map[dateKey] ?? [];
      const target = day.find(t => t.id === taskId)!;
      const nextDay = day.map(t => (t.id === taskId ? { ...t, done: true } : t));
      const active = nextDay.filter(t => !t.archived);
      const arch = nextDay.filter(t => t.archived);
      await writeMap({ ...map, [dateKey]: [...sortActiveTasks(active), ...arch] });
      if (userId) void supabase.from('tasks').update({ done: true }).eq('id', taskId).eq('user_id', userId);
      void syncTaskDoneToApple(target, true, { dateKey });

      await postWrite('task', { ...target, done: true, date: dateKey }, 'update');
      return { summary: `Marked "${target.label}" done` };
    }

    case 'log_pb': {
      const exerciseId = str(data.exerciseId) ?? str(data.exercise_id);
      const weightKg = numOrUndef(data.weightKg) ?? numOrUndef(data.weight_kg);
      if (!exerciseId || weightKg === undefined) throw new Error('I need an exercise and a weight to log a PB.');
      if (!userId) throw new Error('Not signed in.');
      const reps = numOrUndef(data.reps) ?? 1;
      const e1rm = estimated1RM(weightKg, reps);
      const prevBest = await bestEstimated1RM(userId, exerciseId);
      if (e1rm <= prevBest) {
        throw new Error(`That's not a PB — your best estimated 1RM for this exercise is already ${prevBest.toFixed(1)}kg.`);
      }
      const row = {
        id: genId(),
        user_id: userId,
        exercise_id: exerciseId,
        weight_kg: weightKg,
        reps: numOrUndef(data.reps) ?? null,
        date: resolveDateKey(data.date),
      };
      const { error } = await supabase.from('pb_log').upsert(row, { onConflict: 'user_id,exercise_id,date' });
      if (error) throw new Error(error.message);
      await postWrite('workout', row, 'create');
      return { summary: `Logged PB: ${exerciseId} ${weightKg}kg` };
    }

    case 'log_set': {
      const exerciseId = str(data.exerciseId) ?? str(data.exercise_id);
      const weightKg = numOrUndef(data.weightKg) ?? numOrUndef(data.weight_kg);
      const reps = numOrUndef(data.reps);
      if (!exerciseId || weightKg === undefined || reps === undefined) {
        throw new Error('I need an exercise, a weight, and reps to log a set.');
      }
      if (!userId) throw new Error('Not signed in.');
      const date = resolveDateKey(data.date);
      const e1rm = estimated1RM(weightKg, reps);
      const setRow = {
        id: genId(),
        user_id: userId,
        exercise_id: exerciseId,
        date,
        weight_kg: weightKg,
        reps,
        estimated_1rm_kg: e1rm,
        rom_cm: numOrUndef(data.romCm) ?? numOrUndef(data.rom_cm) ?? null,
        peak_velocity_mps: numOrUndef(data.peakVelocityMps) ?? numOrUndef(data.peak_velocity_mps) ?? null,
        tempo_seconds: numOrUndef(data.tempoSeconds) ?? numOrUndef(data.tempo_seconds) ?? null,
        source: str(data.source) === 'device' ? 'device' : 'manual',
      };
      const { error } = await supabase.from('exercise_sets').insert(setRow);
      if (error) throw new Error(error.message);

      const prevBest = await bestEstimated1RM(userId, exerciseId);
      let newPb = false;
      if (e1rm > prevBest) {
        const { error: pbError } = await supabase.from('pb_log').upsert(
          { id: genId(), user_id: userId, exercise_id: exerciseId, weight_kg: weightKg, reps, date },
          { onConflict: 'user_id,exercise_id,date' },
        );
        if (!pbError) newPb = true;
      }
      await postWrite('workout', setRow, 'create');
      return { summary: `Logged set: ${exerciseId} ${weightKg}kg x${reps}${newPb ? ' — new PB!' : ''}` };
    }

    default:
      throw new Error(`"${action.type}" isn't something I can do yet.`);
  }
}
