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
import { genId, markDoneToday } from './workout-data';
import { getActiveHabits, getLogsForHabit, isDoneOnDate, toggleToday } from './habits-data';
import { logMood } from './mood-data';
import { addMeal } from './meals-data';
import { addWater, logWeight as logBodyWeight } from './body-data';
import { logFocusSession } from './focus-data';
import { addExpense, CATEGORIES as EXPENSE_CATEGORIES } from './finance-data';
import { getActiveMedications, getLogsForMedication, isDoseTakenOnDate, toggleTodayDose } from './medications-data';
import { addGoal } from './goals-data';
import { addIdea } from './library-data';

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
      const done = data.done === undefined ? true : data.done === true;
      const map = await readMap();
      const dateKey = findTaskDateKey(map, taskId);
      if (!dateKey) throw new Error("I couldn't find that task on your calendar.");
      const day = map[dateKey] ?? [];
      const target = day.find(t => t.id === taskId)!;
      const nextDay = day.map(t => (t.id === taskId ? { ...t, done } : t));
      const active = nextDay.filter(t => !t.archived);
      const arch = nextDay.filter(t => t.archived);
      await writeMap({ ...map, [dateKey]: [...sortActiveTasks(active), ...arch] });
      if (userId) void supabase.from('tasks').update({ done }).eq('id', taskId).eq('user_id', userId);
      void syncTaskDoneToApple(target, done, { dateKey });

      await postWrite('task', { ...target, done, date: dateKey }, 'update');
      return { summary: `Marked "${target.label}" ${done ? 'done' : 'not done'}` };
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

    // The 7 cases below close a real gap (Code Audit v3, 2026-09-01):
    // several companions (habitCoach, calorie, sleep, mood) could already
    // gate these to 'auto' — meaning ai-chat tells the CLIENT to run them —
    // but this switch had no case for them, so an auto-gated "log a coffee"
    // in the app's own chat screen threw "log_meal isn't something I can do
    // yet" even though the exact same action works fine from the voice
    // device (which executes server-side instead, via device-log/
    // _shared/actionExecutor.ts). Each one below routes through the SAME
    // local-first data-layer function the app's own manual-entry screens
    // use, so it shows up in the UI immediately, not just after a pull.

    case 'log_meal': {
      const name = str(data.name) ?? str(data.label);
      if (!name) throw new Error("I couldn't tell what the meal was.");
      const date = resolveDateKey(data.date);
      const meal = await addMeal({
        date, name,
        mealType: (str(data.mealType) as any) ?? 'snack',
        calories: numOrUndef(data.calories) ?? 0,
        proteinG: numOrUndef(data.proteinG) ?? numOrUndef(data.protein_g) ?? 0,
        carbsG: numOrUndef(data.carbsG) ?? numOrUndef(data.carbs_g) ?? 0,
        fatG: numOrUndef(data.fatG) ?? numOrUndef(data.fat_g) ?? 0,
        loggedVia: 'manual',
      });
      return { summary: `Logged ${meal.name} · ${meal.calories} kcal` };
    }

    case 'log_water': {
      const amountMl = numOrUndef(data.amountMl) ?? numOrUndef(data.amount_ml);
      if (!amountMl) throw new Error("I couldn't tell how much water.");
      await addWater(amountMl);
      return { summary: `Logged ${amountMl}ml water` };
    }

    case 'log_weight': {
      const weightKg = numOrUndef(data.weightKg) ?? numOrUndef(data.weight_kg);
      if (weightKg === undefined) throw new Error("I couldn't tell the weight.");
      await logBodyWeight(weightKg);
      return { summary: `Logged ${weightKg}kg` };
    }

    case 'toggle_habit': {
      const name = str(data.name) ?? str(data.habit) ?? str(data.label);
      if (!name) throw new Error("I couldn't tell which habit.");
      const habits = await getActiveHabits();
      const want = name.toLowerCase().trim();
      const habit = habits.find(h => h.name.toLowerCase().trim() === want)
        ?? habits.find(h => h.name.toLowerCase().includes(want));
      if (!habit) throw new Error(`No habit matching "${name}".`);
      const desired = data.completed === undefined ? true : data.completed === true;
      const logs = await getLogsForHabit(habit.id);
      const current = isDoneOnDate(logs, toDateKey(new Date()));
      // toggleToday only ever flips -- calling it when already in the
      // desired state would incorrectly undo it.
      if (current !== desired) await toggleToday(habit);
      return { summary: `${habit.name} ${desired ? '✓' : '✗'}` };
    }

    case 'log_sleep': {
      const totalHours = numOrUndef(data.totalHours);
      if (totalHours === undefined) throw new Error("I couldn't tell how many hours.");
      if (!userId) throw new Error('Not signed in.');
      // No local-first function accepts a bare totalHours (lib/sleep-data.ts's
      // logSleep() derives it from bedtime+wakeTime, which voice/chat never
      // have) -- same "no suitable local cache to route through" reasoning
      // as log_set above. sleep_logs' own pullRemoteSleep() picks this up.
      const date = resolveDateKey(data.date);
      const { error } = await supabase.from('sleep_logs').upsert(
        { id: genId(), user_id: userId, date, total_hours: totalHours,
          quality_score: numOrUndef(data.qualityScore) ?? null, source_device: 'manual' },
        { onConflict: 'user_id,date' },
      );
      if (error) throw new Error(error.message);
      return { summary: `Logged ${totalHours}h sleep` };
    }

    case 'log_mood': {
      const moodScore = numOrUndef(data.moodScore);
      if (moodScore === undefined) throw new Error("I couldn't tell the mood score.");
      await logMood({ moodScore, note: str(data.note), triggers: [] });
      return { summary: `Logged mood ${moodScore}/10` };
    }

    case 'remember_about_user': {
      const note = str(data.note) ?? str(data.fact) ?? str(data.text);
      if (!note) throw new Error("I couldn't tell what to remember.");
      if (!userId) throw new Error('Not signed in.');
      const { data: existing } = await supabase
        .from('user_context_summary').select('assistant_notes_md').eq('user_id', userId).maybeSingle();
      const bullet = `- ${note}`;
      const lines = (existing?.assistant_notes_md ?? '').split('\n').filter((l: string) => l.trim());
      if (!lines.includes(bullet)) {
        const nextMd = [...lines, bullet].slice(-30).join('\n');
        const { error } = await supabase.from('user_context_summary').upsert(
          { user_id: userId, assistant_notes_md: nextMd, notes_updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
        if (error) throw new Error(error.message);
      }
      return { summary: `Remembered: ${note}` };
    }

    case 'gym_checkin': {
      await markDoneToday('device-checkin');
      return { summary: 'Gym session logged' };
    }

    case 'log_focus_session': {
      const durationMins = numOrUndef(data.durationMins) ?? numOrUndef(data.duration_mins);
      if (!durationMins) throw new Error("I couldn't tell the duration.");
      logFocusSession(durationMins);
      return { summary: `Logged ${durationMins} min focus session` };
    }

    case 'log_activity': {
      const type = str(data.type);
      const durationMins = numOrUndef(data.durationMins) ?? numOrUndef(data.duration_mins);
      if (!type || !durationMins) throw new Error("I couldn't tell the activity type and duration.");
      if (!userId) throw new Error('Not signed in.');
      // No local-first function accepts a waypoint-less activity (workout-
      // data's saveActivity computes distance FROM a GPS track) -- same
      // "no suitable local cache" reasoning as log_sleep/log_set above.
      const durationSecs = Math.round(durationMins * 60);
      const end = new Date();
      const start = new Date(end.getTime() - durationSecs * 1000);
      const { error } = await supabase.from('activities').insert({
        id: genId(), user_id: userId, type,
        start_time: start.toISOString(), end_time: end.toISOString(),
        duration_secs: durationSecs, distance_m: numOrUndef(data.distanceM) ?? numOrUndef(data.distance_m) ?? 0,
        notes: str(data.notes) ?? null,
      });
      if (error) throw new Error(error.message);
      return { summary: `Logged ${type} · ${durationMins} min` };
    }

    case 'log_expense': {
      const amount = numOrUndef(data.amount);
      if (amount === undefined) throw new Error("I couldn't tell the amount.");
      const rawCategory = str(data.category)?.toLowerCase();
      const category = (EXPENSE_CATEGORIES as readonly string[]).includes(rawCategory ?? '')
        ? (rawCategory as any) : 'other';
      await addExpense({ amount, category, note: str(data.note), date: resolveDateKey(data.date) });
      return { summary: `Logged ${amount} (${category})` };
    }

    case 'log_medication': {
      const name = str(data.name) ?? str(data.medication);
      if (!name) throw new Error("I couldn't tell which medication.");
      const meds = await getActiveMedications();
      const want = name.toLowerCase().trim();
      const med = meds.find(m => m.name.toLowerCase().trim() === want)
        ?? meds.find(m => m.name.toLowerCase().includes(want));
      if (!med) throw new Error(`No medication matching "${name}".`);
      const desired = data.taken === undefined ? true : data.taken === true;
      const logs = await getLogsForMedication(med.id);
      const current = isDoseTakenOnDate(logs, toDateKey(new Date()));
      if (current !== desired) await toggleTodayDose(med);
      return { summary: `${med.name} ${desired ? '✓' : '✗'}` };
    }

    case 'create_goal': {
      const title = str(data.title) ?? str(data.name);
      if (!title) throw new Error("I couldn't tell the goal.");
      await addGoal({ title, category: str(data.category), targetDate: str(data.targetDate) });
      return { summary: `Goal added: ${title}` };
    }

    case 'save_idea': {
      const content = str(data.content) ?? str(data.note) ?? str(data.name);
      if (!content) throw new Error("I couldn't tell the idea.");
      await addIdea(content);
      return { summary: `Idea saved: ${content}` };
    }

    default:
      throw new Error(`"${action.type}" isn't something I can do yet.`);
  }
}
