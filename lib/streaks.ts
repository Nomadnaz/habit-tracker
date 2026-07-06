// ─────────────────────────────────────────────────────────────────────────
// streaks.ts — workout-count refresh for the Body hub (postWrite step)
// ─────────────────────────────────────────────────────────────────────────
// This file used to be a generic per-entity-type streak cache. An audit
// (2026-07-06) found it was mostly dead-wrong code:
//   - Habits (the domain streaks exist for) deliberately bypass it — a
//     single counter per entity TYPE can't hold more than one running
//     streak, so per-habit streaks live in lib/habits-data.ts instead
//     (see tasks/023's notes). Nothing else in the app ever reads
//     getStreak()/resetStreak() — verified by search.
//   - It ignored the write's completed/action state entirely, so
//     un-completing a habit (or any 'update' write) INCREMENTED the cached
//     streak instead of leaving it alone or decrementing.
//   - Its date-decrement used to double-count via a UTC/local mismatch
//     (fixed separately, see lib/dateKey.ts's addDaysToKey).
//   - Its one real, correct job — refreshing @body.workoutsTotal so the
//     Body hub's stat and the workouts_10/first_workout badges (task 063)
//     have a live count — had a same-day early-return bug: a second
//     workout marked done on the same day skipped the refresh entirely
//     (task 014/badges' H3 finding).
//
// So: the broken generic cache is gone. This file now does exactly the one
// thing it was actually needed for, unconditionally and correctly.
// ─────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

/**
 * Refresh @body.workoutsTotal from a live count of workout_done_log. Called
 * by postWrite.ts, awaited before the badge check (which reads this same
 * value) — see postWrite.ts's ordering comment. No-ops for every entity
 * except 'workout', and always re-counts (no early return), so a second
 * workout logged on the same day is reflected immediately.
 */
export async function refreshWorkoutsTotal(entity: string): Promise<void> {
  if (entity !== 'workout') return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const { count } = await supabase
      .from('workout_done_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (count === null) return;

    const bodyData = await AsyncStorage.getItem('@body');
    const body = bodyData ? JSON.parse(bodyData) : {};
    body.workoutsTotal = count;
    await AsyncStorage.setItem('@body', JSON.stringify(body));
  } catch (err) {
    console.error('refreshWorkoutsTotal error:', err);
    // Non-fatal: postWrite awaits this on its own but never lets a failure
    // here block the rest of the fan-out (see postWrite.ts).
  }
}
