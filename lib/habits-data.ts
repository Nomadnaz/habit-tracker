// ─────────────────────────────────────────────────────────────────────────
// HABITS — LOCAL DATA LAYER
// ─────────────────────────────────────────────────────────────────────────
// Same local-first pattern as lib/meals-data.ts: habits + their completion
// logs live in AsyncStorage so the list/heatmap render instantly and work
// offline, then each mutation fires-and-forgets to Supabase and runs
// postWrite(). Per-habit streaks are computed from habit_logs (the source of
// truth) rather than the generic entity-keyed lib/streaks.ts cache, because
// that cache has no room for more than one running streak per entity type —
// fine for singular domains (workout/meal) but wrong once a user has more
// than one habit. Current/longest streak are also cached into `streak_data`
// so other surfaces (buildContext, future freeze/repair UI) can read them
// without recomputing from the full log.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey, addDaysToKey } from './dateKey';
import { postWrite } from './postWrite';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const HABITS_KEY = '@habits';
const LOGS_KEY    = '@habit_logs'; // Record<habitId, HabitLog[]>

export type Frequency = 'daily' | 'weekly';

export type Habit = {
  id: string;
  name: string;
  frequency: Frequency;
  reminderTime?: string;
  active: boolean;
  autoFreezeEnabled: boolean; // task 076: MVP freeze-only streak recovery
  createdAt: string; // ISO timestamp
};

export type HabitLog = {
  id: string;
  habitId: string;
  date: string; // canonical YYYY-MM-DD
  completed: boolean;
  notes?: string;
  createdAt: string;
};

export type StreakInfo = { current: number; longest: number };

// ── Habits: load / mutate ────────────────────────────────────────────────────

async function loadHabits(): Promise<Habit[]> {
  try {
    const raw = await AsyncStorage.getItem(HABITS_KEY);
    if (raw) return JSON.parse(raw) as Habit[];
  } catch { /* fall through */ }
  return [];
}

async function saveHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits));
}

export async function getActiveHabits(): Promise<Habit[]> {
  const habits = await loadHabits();
  return habits.filter(h => h.active);
}

export async function addHabit(input: { name: string; frequency: Frequency; reminderTime?: string }): Promise<Habit> {
  const habit: Habit = {
    id: genId(),
    name: input.name,
    frequency: input.frequency,
    reminderTime: input.reminderTime,
    active: true,
    autoFreezeEnabled: false,
    createdAt: new Date().toISOString(),
  };
  const habits = await loadHabits();
  await saveHabits([...habits, habit]);

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('habits').insert({
      id: habit.id, user_id: userId, name: habit.name, frequency: habit.frequency,
      reminder_time: habit.reminderTime ?? null, active: true, auto_freeze_enabled: false,
    });
  });
  return habit;
}

/** Task 076 MVP: 2 free auto-freezes/month, opt-in per habit. */
export async function setAutoFreeze(habitId: string, enabled: boolean): Promise<void> {
  const habits = await loadHabits();
  await saveHabits(habits.map(h => (h.id === habitId ? { ...h, autoFreezeEnabled: enabled } : h)));
  bg(async () => { await supabase.from('habits').update({ auto_freeze_enabled: enabled }).eq('id', habitId); });
}

export async function deleteHabit(habitId: string): Promise<void> {
  const habits = await loadHabits();
  await saveHabits(habits.filter(h => h.id !== habitId));

  const logMap = await loadLogMap();
  delete logMap[habitId];
  await saveLogMap(logMap);

  bg(async () => { await supabase.from('habits').delete().eq('id', habitId); });
}

// ── Habit logs: load / mutate ────────────────────────────────────────────────

type LogMap = Record<string, HabitLog[]>; // habitId -> logs, unsorted

async function loadLogMap(): Promise<LogMap> {
  try {
    const raw = await AsyncStorage.getItem(LOGS_KEY);
    if (raw) return JSON.parse(raw) as LogMap;
  } catch { /* fall through */ }
  return {};
}

async function saveLogMap(map: LogMap): Promise<void> {
  await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(map));
}

export async function getLogsForHabit(habitId: string): Promise<HabitLog[]> {
  const map = await loadLogMap();
  return map[habitId] ?? [];
}

export function isDoneOnDate(logs: HabitLog[], dateKey: string): boolean {
  return logs.some(l => l.date === dateKey && l.completed);
}

/** Toggle today's completion for a habit. Returns the new completed state. */
export async function toggleToday(habit: Habit): Promise<boolean> {
  const today = toDateKey(new Date());
  const map = await loadLogMap();
  const logs = map[habit.id] ?? [];
  const existing = logs.find(l => l.date === today);

  let nextCompleted: boolean;
  let record: HabitLog;
  if (existing) {
    nextCompleted = !existing.completed;
    record = { ...existing, completed: nextCompleted };
    map[habit.id] = logs.map(l => (l.id === existing.id ? record : l));
  } else {
    nextCompleted = true;
    record = { id: genId(), habitId: habit.id, date: today, completed: true, createdAt: new Date().toISOString() };
    map[habit.id] = [...logs, record];
  }
  await saveLogMap(map);

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('habit_logs').upsert(
      { id: record.id, user_id: userId, habit_id: habit.id, date: today, completed: nextCompleted, notes: record.notes ?? null },
      { onConflict: 'habit_id,date' },
    );
  });

  // Recompute + persist streak from the source-of-truth log, then run the
  // shared fan-out (cumulative_stats / badges) — never touched directly.
  // streak.current is included so postWrite's badge check (streak_7/streak_30,
  // task 063) doesn't need to recompute it or import this module back.
  const streak = computeStreak(map[habit.id]);
  bg(() => saveStreak(habit.id, streak, nextCompleted ? today : null));
  postWrite('habit', { habit_id: habit.id, date: today, completed: nextCompleted, streak: streak.current }, existing ? 'update' : 'create');

  return nextCompleted;
}

async function saveStreak(habitId: string, streak: StreakInfo, lastCompletedDate: string | null): Promise<void> {
  const userId = await getUid();
  if (!userId) return;
  await supabase.from('streak_data').upsert(
    {
      user_id: userId, habit_id: habitId,
      current_streak: streak.current, longest_streak: streak.longest,
      last_completed_date: lastCompletedDate,
    },
    { onConflict: 'user_id,habit_id' },
  );
}

// ── Streak + heatmap helpers ──────────────────────────────────────────────────

/** Current streak = consecutive completed days ending today or yesterday. */
export function computeStreak(logs: Array<{ date: string; completed: boolean }>): StreakInfo {
  const doneDates = new Set(logs.filter(l => l.completed).map(l => l.date));
  if (doneDates.size === 0) return { current: 0, longest: 0 };

  const sorted = [...doneDates].sort();

  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const date of sorted) {
    if (prev && daysBetween(prev, date) === 1) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
    prev = date;
  }

  const today = toDateKey(new Date());
  const yesterday = addDaysToKey(today, -1);
  let current = 0;
  if (doneDates.has(today) || doneDates.has(yesterday)) {
    let cursor = doneDates.has(today) ? today : yesterday;
    while (doneDates.has(cursor)) {
      current += 1;
      cursor = addDaysToKey(cursor, -1);
    }
  }

  return { current, longest };
}

function daysBetween(aKey: string, bKey: string): number {
  const a = new Date(aKey), b = new Date(bKey);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export type HeatmapCell = { date: string; state: 'done' | 'missed' | 'before' | 'frozen' };

/**
 * Task 076 MVP: which past missed days are covered by an auto-freeze, capped
 * at 2 per calendar month, only for habits with autoFreezeEnabled. Walks
 * chronologically (oldest -> newest) so the monthly cap is applied in the
 * order freezes actually would have been consumed, not in reverse.
 */
export function computeFrozenDates(habit: Habit, logs: HabitLog[]): Set<string> {
  const frozen = new Set<string>();
  if (!habit.autoFreezeEnabled) return frozen;

  const doneDates = new Set(logs.filter(l => l.completed).map(l => l.date));
  const createdKey = toDateKey(new Date(habit.createdAt));
  const today = toDateKey(new Date());

  let cursor = createdKey;
  let monthKey = '';
  let usedThisMonth = 0;
  while (cursor < today) {
    const thisMonth = cursor.slice(0, 7);
    if (thisMonth !== monthKey) { monthKey = thisMonth; usedThisMonth = 0; }
    if (!doneDates.has(cursor) && usedThisMonth < 2) {
      frozen.add(cursor);
      usedThisMonth += 1;
    }
    cursor = addDaysToKey(cursor, 1);
  }
  return frozen;
}

/** Same as computeStreak, but a frozen day counts as continuing the streak. */
export function computeStreakWithFreezes(habit: Habit, logs: HabitLog[]): StreakInfo {
  if (!habit.autoFreezeEnabled) return computeStreak(logs);
  const frozenDates = computeFrozenDates(habit, logs);
  const augmented = logs.map(l => l);
  for (const date of frozenDates) augmented.push({ id: `frozen-${date}`, habitId: habit.id, date, completed: true, createdAt: '' });
  return computeStreak(augmented);
}

/** Last `days` cells ending today, for HeatmapCalendar. Frozen days render blue. */
export function buildHeatmap(habit: Habit, logs: HabitLog[], days = 35): HeatmapCell[] {
  const doneDates = new Set(logs.filter(l => l.completed).map(l => l.date));
  const frozenDates = computeFrozenDates(habit, logs);
  const createdKey = toDateKey(new Date(habit.createdAt));
  const cells: HeatmapCell[] = [];
  const today = toDateKey(new Date());
  for (let i = days - 1; i >= 0; i--) {
    const key = addDaysToKey(today, -i);
    const state: HeatmapCell['state'] =
      key < createdKey ? 'before' : doneDates.has(key) ? 'done' : frozenDates.has(key) ? 'frozen' : 'missed';
    cells.push({ date: key, state });
  }
  return cells;
}
