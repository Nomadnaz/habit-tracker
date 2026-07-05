// ─────────────────────────────────────────────────────────────────────────
// GOALS — LOCAL DATA LAYER (task 068, structured part only)
// ─────────────────────────────────────────────────────────────────────────
// Same local-first pattern as the rest of this app. Progress % for a goal
// with milestones is derived (completed/total); a goal with a manual
// goal_log progress entry uses the latest logged percent instead.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey } from './dateKey';
import { postWrite } from './postWrite';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

const GOALS_KEY = '@goals';
const MILESTONES_KEY = '@goal_milestones'; // Record<goalId, Milestone[]>
const LOGS_KEY = '@goal_logs';             // Record<goalId, GoalLog[]>

export type GoalStatus = 'active' | 'done' | 'abandoned';

export type Goal = {
  id: string; title: string; category?: string; why?: string;
  targetDate?: string; status: GoalStatus; createdAt: string;
};
export type Milestone = { id: string; goalId: string; title: string; deadline?: string; completed: boolean };
export type GoalLog = { id: string; goalId: string; date: string; note?: string; progressPercent?: number };

async function loadMap<T>(key: string): Promise<Record<string, T[]>> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return {};
}
async function loadList<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return [];
}

export async function getActiveGoals(): Promise<Goal[]> {
  const goals = await loadList<Goal>(GOALS_KEY);
  return goals.filter(g => g.status === 'active');
}

export async function addGoal(input: { title: string; category?: string; why?: string; targetDate?: string }): Promise<Goal> {
  const goal: Goal = { id: genId(), status: 'active', createdAt: new Date().toISOString(), ...input };
  const goals = await loadList<Goal>(GOALS_KEY);
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify([...goals, goal]));
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('goals').insert({
      id: goal.id, user_id: userId, title: goal.title, category: goal.category ?? null,
      why: goal.why ?? null, target_date: goal.targetDate ?? null, status: goal.status,
    });
  });
  return goal;
}

export async function setGoalStatus(goalId: string, status: GoalStatus): Promise<void> {
  const goals = await loadList<Goal>(GOALS_KEY);
  await AsyncStorage.setItem(GOALS_KEY, JSON.stringify(goals.map(g => (g.id === goalId ? { ...g, status } : g))));
  bg(async () => { await supabase.from('goals').update({ status }).eq('id', goalId); });
}

export async function getMilestones(goalId: string): Promise<Milestone[]> {
  const map = await loadMap<Milestone>(MILESTONES_KEY);
  return map[goalId] ?? [];
}

export async function addMilestone(goalId: string, title: string, deadline?: string): Promise<Milestone> {
  const milestone: Milestone = { id: genId(), goalId, title, deadline, completed: false };
  const map = await loadMap<Milestone>(MILESTONES_KEY);
  map[goalId] = [...(map[goalId] ?? []), milestone];
  await AsyncStorage.setItem(MILESTONES_KEY, JSON.stringify(map));
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('milestones').insert({
      id: milestone.id, user_id: userId, goal_id: goalId, title, deadline: deadline ?? null,
    });
  });
  return milestone;
}

export async function toggleMilestone(goalId: string, milestoneId: string): Promise<void> {
  const map = await loadMap<Milestone>(MILESTONES_KEY);
  const list = map[goalId] ?? [];
  let nowCompleted = false;
  map[goalId] = list.map(m => {
    if (m.id !== milestoneId) return m;
    nowCompleted = !m.completed;
    return { ...m, completed: nowCompleted };
  });
  await AsyncStorage.setItem(MILESTONES_KEY, JSON.stringify(map));
  bg(async () => {
    await supabase.from('milestones').update({
      completed: nowCompleted, completed_at: nowCompleted ? new Date().toISOString() : null,
    }).eq('id', milestoneId);
  });
  postWrite('goal', { goal_id: goalId, milestone_id: milestoneId, completed: nowCompleted }, 'update');
}

export async function getGoalLogs(goalId: string): Promise<GoalLog[]> {
  const map = await loadMap<GoalLog>(LOGS_KEY);
  return map[goalId] ?? [];
}

export async function logProgress(goalId: string, note: string | undefined, progressPercent?: number): Promise<GoalLog> {
  const log: GoalLog = { id: genId(), goalId, date: toDateKey(new Date()), note, progressPercent };
  const map = await loadMap<GoalLog>(LOGS_KEY);
  map[goalId] = [...(map[goalId] ?? []), log];
  await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(map));
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('goal_logs').insert({
      id: log.id, user_id: userId, goal_id: goalId, date: log.date,
      note: note ?? null, progress_percent: progressPercent ?? null,
    });
  });
  return log;
}

/** Milestone completion ratio, or the latest manually-logged %, or 0. */
export function computeProgress(milestones: Milestone[], logs: GoalLog[]): number {
  if (milestones.length > 0) {
    return Math.round((milestones.filter(m => m.completed).length / milestones.length) * 100);
  }
  const withProgress = logs.filter(l => typeof l.progressPercent === 'number');
  if (withProgress.length > 0) return withProgress[withProgress.length - 1].progressPercent!;
  return 0;
}
