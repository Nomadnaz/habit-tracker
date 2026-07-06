// ─────────────────────────────────────────────────────────────────────────
// MOOD — LOCAL DATA LAYER (task 066, mood-log half only)
// ─────────────────────────────────────────────────────────────────────────
// Plaintext, local-first, same pattern as every other domain — mood_logs is
// NOT the encrypted half of this task (system-model.md's client-side
// encryption rule names journal/therapy specifically). Journal/therapy are
// deliberately not built here at all — see the migration's header comment
// and tasks/066's notes for why.
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

const MOOD_KEY = '@mood_logs'; // Record<dateKey, MoodLog>

export type MoodLog = {
  id: string; date: string; moodScore: number; stressScore?: number;
  triggers: string[]; note?: string; createdAt: string;
};

export const TRIGGERS = ['work', 'sleep', 'health', 'relationships', 'money', 'social'] as const;

async function loadMap(): Promise<Record<string, MoodLog>> {
  try {
    const raw = await AsyncStorage.getItem(MOOD_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return {};
}

export async function getRecentMoodLogs(days = 14): Promise<MoodLog[]> {
  const map = await loadMap();
  const today = toDateKey(new Date());
  const out: MoodLog[] = [];
  for (let i = 0; i < days; i++) {
    const key = addDaysToKey(today, -i);
    if (map[key]) out.push(map[key]);
  }
  return out.reverse();
}

export async function getTodayMood(): Promise<MoodLog | null> {
  const map = await loadMap();
  return map[toDateKey(new Date())] ?? null;
}

export async function logMood(input: { moodScore: number; stressScore?: number; triggers: string[]; note?: string }): Promise<MoodLog> {
  const date = toDateKey(new Date());
  const log: MoodLog = { id: genId(), date, createdAt: new Date().toISOString(), ...input };
  const map = await loadMap();
  map[date] = log;
  await AsyncStorage.setItem(MOOD_KEY, JSON.stringify(map));

  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    await supabase.from('mood_logs').upsert(
      {
        id: log.id, user_id: userId, date, mood_score: log.moodScore,
        stress_score: log.stressScore ?? null, triggers: log.triggers, note: log.note ?? null,
      },
      { onConflict: 'user_id,date' },
    );
  });
  postWrite('mood', { date, moodScore: log.moodScore, stressScore: log.stressScore }, 'create');
  return log;
}
