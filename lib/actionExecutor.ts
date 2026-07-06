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

      await postWrite('task', task, 'create');
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

      await postWrite('task', updated, 'update');
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

      await postWrite('task', { ...target, done: true }, 'update');
      return { summary: `Marked "${target.label}" done` };
    }

    case 'log_pb': {
      const exerciseId = str(data.exerciseId) ?? str(data.exercise_id);
      const weightKg = numOrUndef(data.weightKg) ?? numOrUndef(data.weight_kg);
      if (!exerciseId || weightKg === undefined) throw new Error('I need an exercise and a weight to log a PB.');
      if (!userId) throw new Error('Not signed in.');
      const row = {
        user_id: userId,
        exercise_id: exerciseId,
        weight_kg: weightKg,
        reps: numOrUndef(data.reps) ?? null,
        date: resolveDateKey(data.date),
      };
      const { error } = await supabase.from('pb_log').insert(row);
      if (error) throw new Error(error.message);
      await postWrite('workout', row, 'create');
      return { summary: `Logged PB: ${exerciseId} ${weightKg}kg` };
    }

    default:
      throw new Error(`"${action.type}" isn't something I can do yet.`);
  }
}
