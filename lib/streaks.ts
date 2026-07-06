// ─────────────────────────────────────────────────────────────────────────
// streaks.ts — Compute and cache user streaks
// ─────────────────────────────────────────────────────────────────────────
// Called by postWrite.ts after task/workout/habit writes.
// Caches streak data in AsyncStorage to avoid repeated queries.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { toDateKey } from './dateKey';

const STREAK_KEY = '@streaks';

export interface StreakData {
  [entity: string]: number; // entity → current streak count
}

// Get current streak from AsyncStorage cache
export async function getStreak(entity: string): Promise<number> {
  try {
    const streaks = await AsyncStorage.getItem(STREAK_KEY);
    if (!streaks) return 0;
    const parsed = JSON.parse(streaks);
    return parsed[entity] || 0;
  } catch {
    return 0;
  }
}

// Update streak in cache (called by postWrite)
export async function updateStreak(entity: string, record: any): Promise<void> {
  try {
    const streaks = await AsyncStorage.getItem(STREAK_KEY);
    const parsed = streaks ? JSON.parse(streaks) : {};

    // Simple logic: increment streak if action is today, reset if gap.
    // MUST use the canonical LOCAL date key (lib/dateKey.ts) — UTC
    // toISOString() rolls the day over at the wrong local moment and breaks
    // streaks for users west of UTC (system-model.md streak rule).
    const today = toDateKey(new Date());
    const lastKey = `${entity}_last_date`;

    const lastDate = parsed[lastKey];
    if (lastDate === today) {
      // Already incremented today
      return;
    }

    const yesterday = toDateKey(new Date(Date.now() - 86400000));
    if (lastDate === yesterday) {
      // Consecutive day — increment
      parsed[entity] = (parsed[entity] || 0) + 1;
    } else {
      // Gap — reset
      parsed[entity] = 1;
    }

    parsed[lastKey] = today;

    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(parsed));

    // Also update the workoutsTotal stat for the Body screen
    if (entity === 'workout') {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        const { count } = await supabase
          .from('workout_done_log')
          .select('*', { count: 'exact' })
          .eq('user_id', userId);

        if (count !== null) {
          const bodyData = await AsyncStorage.getItem('@body');
          const body = bodyData ? JSON.parse(bodyData) : {};
          body.workoutsTotal = count;
          await AsyncStorage.setItem('@body', JSON.stringify(body));
        }
      }
    }
  } catch (err) {
    console.error('updateStreak error:', err);
    // Non-fatal: streaks are cosmetic
  }
}

export async function resetStreak(entity: string): Promise<void> {
  try {
    const streaks = await AsyncStorage.getItem(STREAK_KEY);
    const parsed = streaks ? JSON.parse(streaks) : {};
    parsed[entity] = 0;
    await AsyncStorage.setItem(STREAK_KEY, JSON.stringify(parsed));
  } catch (err) {
    console.error('resetStreak error:', err);
  }
}
