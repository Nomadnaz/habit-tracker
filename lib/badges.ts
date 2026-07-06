// ─────────────────────────────────────────────────────────────────────────
// BADGES — launch set of ~10 (task 063), not the full 100+ catalogue.
// ─────────────────────────────────────────────────────────────────────────
// The catalogue is a static config (database.md's own suggestion — no
// `badges` table needed unless it must be editable without a redeploy).
// Called from lib/postWrite.ts's checkBadges step. Reads raw AsyncStorage
// blobs directly (NOT the other domains' lib/*-data.ts functions) to avoid
// a circular import: postWrite.ts -> badges.ts -> habits-data.ts ->
// postWrite.ts would be a real cycle since habits-data.ts already imports
// postWrite. A little duplicated counting logic here is the cheaper trade.
//
// Push notifications on unlock are NOT implemented — there's no
// notification infra yet (task 071 territory, device-gated). Earning a
// badge is persisted and logged; surfacing it to the user beyond the
// profile screen's badge grid is future work.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import type { Entity } from './postWrite';
import { withStorageLock } from './storageLock';

export type Badge = { id: string; name: string; description: string; hidden?: boolean };

export const BADGES: Badge[] = [
  { id: 'first_habit', name: 'First Step', description: 'Complete your first habit.' },
  { id: 'streak_7', name: 'Week One', description: 'Reach a 7-day streak on any habit.' },
  { id: 'streak_30', name: 'Committed', description: 'Reach a 30-day streak on any habit.' },
  { id: 'first_workout', name: 'First Rep', description: 'Log your first workout.' },
  { id: 'workouts_10', name: 'Regular', description: 'Log 10 workouts.' },
  { id: 'first_run', name: 'On the Move', description: 'Log your first run.' },
  { id: 'first_hike', name: 'Trailblazer', description: 'Log your first hike.' },
  { id: 'first_meal', name: 'Fueled Up', description: 'Log your first meal.' },
  { id: 'phone_free_week', name: 'Unplugged', description: 'Win the Phone Down Challenge 7 days running.' },
  { id: 'early_bird', name: 'Early Bird', description: '???', hidden: true },
];

const EARNED_KEY = '@badges_earned';

async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getEarnedBadgeIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(EARNED_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* fall through */ }
  return [];
}

async function award(id: string): Promise<boolean> {
  const newlyAwarded = await withStorageLock(EARNED_KEY, async () => {
    const earned = await getEarnedBadgeIds();
    if (earned.includes(id)) return false;
    await AsyncStorage.setItem(EARNED_KEY, JSON.stringify([...earned, id]));
    return true;
  });
  if (!newlyAwarded) return false;

  const userId = await getUid();
  if (userId) {
    try {
      await supabase.from('badges_earned').upsert({ user_id: userId, badge_id: id });
    } catch { /* local award still stands; Supabase mirror can lag */ }
  }
  console.log(`[badges] earned: ${id}`);
  return true;
}

async function countInBlob(key: string, predicate: (item: any) => boolean): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    const items: any[] = Array.isArray(parsed) ? parsed : Object.values(parsed).flat();
    return items.filter(predicate).length;
  } catch {
    return 0;
  }
}

/** Returns newly-earned badge ids (empty if none). Never throws. */
export async function checkAndAwardBadges(entity: Entity, record: any): Promise<string[]> {
  const newlyEarned: string[] = [];
  const maybeAward = async (id: string, condition: boolean) => {
    if (condition && (await award(id))) newlyEarned.push(id);
  };

  // Every "first_X"/"X_10" check below uses >= rather than === N: award()
  // already dedupes via the earned-badges cache (a no-op after the first
  // grant), but exact equality meant a count that skipped past N — e.g. a
  // habit imported/synced after the fact, or the workout counter (see
  // below) missing a same-day refresh — would permanently miss the badge.
  // Audit finding H3 (2026-07-06).
  try {
    if (entity === 'habit' && record.completed) {
      const totalHabitLogs = await countInBlob('@habit_logs', (l: any) => l.completed);
      await maybeAward('first_habit', totalHabitLogs >= 1);
      if (typeof record.streak === 'number') {
        await maybeAward('streak_7', record.streak >= 7);
        await maybeAward('streak_30', record.streak >= 30);
      }
    }

    if (entity === 'workout') {
      try {
        const raw = await AsyncStorage.getItem('@body');
        const total = raw ? JSON.parse(raw).workoutsTotal ?? 0 : 0;
        await maybeAward('first_workout', total >= 1);
        await maybeAward('workouts_10', total >= 10);
      } catch { /* no-op */ }
    }

    if (entity === 'activity') {
      const sameType = await countInBlob('@activities', (a: any) => a.type === record.type);
      if (record.type === 'run') await maybeAward('first_run', sameType >= 1);
      if (record.type === 'hike') await maybeAward('first_hike', sameType >= 1);
    }

    if (entity === 'meal') {
      const total = await countInBlob('@meals', () => true);
      await maybeAward('first_meal', total >= 1);
    }

    if (entity === 'sleep') {
      if (typeof record.challengeStreak === 'number') {
        await maybeAward('phone_free_week', record.challengeStreak >= 7);
      }
      if (typeof record.wakeTime === 'string') {
        const [h] = record.wakeTime.split(':').map(Number);
        await maybeAward('early_bird', h < 6);
      }
    }
  } catch (err) {
    console.warn('checkAndAwardBadges error:', err);
  }

  return newlyEarned;
}
