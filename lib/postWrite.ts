// ─────────────────────────────────────────────────────────────────────────
// postWrite.ts — Centralized side-effect orchestration
// ─────────────────────────────────────────────────────────────────────────
// Called after ANY domain write (task, workout, habit, etc.). One effect
// (refreshWorkoutsTotal) runs first, awaited on its own — see the ordering
// comment below. The remaining 4 (cumulative_stats, badges, friend-feed
// stub, Obsidian stub) run in parallel via Promise.allSettled; one failing
// doesn't block the others. (A 6th effect, updateUserContextSummary, used
// to live here — moved to daily-briefing/index.ts, see below.)
// ─────────────────────────────────────────────────────────────────────────

import { refreshWorkoutsTotal } from './streaks';
import { supabase } from './supabase';
import { checkAndAwardBadges } from './badges';

export type Entity = 'task' | 'workout' | 'habit' | 'water' | 'weight' | 'sleep' | 'meal' | 'medication' | 'activity' | 'goal' | 'expense' | 'mood' | 'focus' | 'book' | 'movie';
export type Action = 'create' | 'update' | 'delete';

export async function postWrite(entity: Entity, record: any, action: Action): Promise<void> {
  // refreshWorkoutsTotal runs FIRST and is awaited on its own: checkBadges
  // (workouts_10/first_workout) reads the @body.workoutsTotal it just wrote
  // — running everything in one Promise.allSettled would race the two with
  // no guaranteed order. (This used to be the generic lib/streaks.ts cache;
  // an audit — 2026-07-06 — found most of that file was dead-wrong code and
  // it was replaced with just this one real job. See lib/streaks.ts's header.)
  await refreshWorkoutsTotal(entity).catch(err => console.warn('postWrite refreshWorkoutsTotal failed:', err));

  const effects = [
    incrementCumulativeStats(entity, record, action),
    checkBadges(entity, record),
    addFriendFeedEvent(entity, record), // stub — task 070/socials FUTURE
    writeObsidian(entity, record), // stub — task 058/059, needs iCloud (device-gated)
  ];

  const results = await Promise.allSettled(effects);

  // Log any failures (but don't throw)
  results.forEach((result, idx) => {
    if (result.status === 'rejected') {
      console.warn(`postWrite effect ${idx} failed:`, result.reason);
    }
  });
}

async function incrementCumulativeStats(entity: Entity, record: any, action: Action): Promise<void> {
  // Book/movie completions arrive as 'update' (status → finished/watched, not
  // a new row) — everything else only counts on 'create'.
  const isLibraryCompletion = (entity === 'book' && record.status === 'finished')
    || (entity === 'movie' && record.status === 'watched');
  if (action !== 'create' && !isLibraryCompletion) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const delta: Record<string, number> = {};
    if (entity === 'habit' && record.completed) delta.total_habits_completed = 1;
    if (entity === 'workout') delta.total_gym_sessions = 1;
    if (entity === 'focus') delta.total_focus_secs = typeof record.durationSecs === 'number' ? record.durationSecs : 0;
    if (entity === 'activity') {
      const meters = typeof record.distanceM === 'number' ? record.distanceM : 0;
      if (record.type === 'run') delta.total_distance_run_m = meters;
      else delta.total_distance_walked_m = meters; // hike + walk both count as walked distance
    }
    if (entity === 'book' && record.status === 'finished') delta.total_books_finished = 1;
    if (entity === 'movie' && record.status === 'watched') delta.total_movies_watched = 1;
    if (Object.keys(delta).length === 0) return; // nothing this entity contributes to yet

    const { data: existing } = await supabase
      .from('cumulative_stats')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const base = existing ?? {
      total_steps: 0, total_distance_walked_m: 0, total_distance_run_m: 0, total_gym_sessions: 0,
      total_focus_secs: 0, total_habits_completed: 0, total_books_finished: 0, total_movies_watched: 0,
      longest_streak_ever: 0,
    };
    const next: Record<string, number> = { ...base };
    for (const [key, amount] of Object.entries(delta)) next[key] = (base[key] ?? 0) + amount;

    await supabase.from('cumulative_stats').upsert({
      user_id: userId, ...next, last_updated: new Date().toISOString(),
    });
  } catch (err) {
    console.error('incrementCumulativeStats error:', err);
    // Never throw — this runs inside Promise.allSettled, but keep the
    // contract explicit: a stats-write failure must never block the caller.
  }
}

async function checkBadges(entity: Entity, record: any): Promise<void> {
  try {
    await checkAndAwardBadges(entity, record);
  } catch (err) {
    console.warn('checkBadges error:', err);
  }
}

async function addFriendFeedEvent(entity: Entity, record: any): Promise<void> {
  // Stub: would add event to friend_feed_events table
  console.log('addFriendFeedEvent stub:', entity);
}

async function writeObsidian(entity: Entity, record: any): Promise<void> {
  // Stub: would write to user's Obsidian vault
  console.log('writeObsidian stub:', entity);
}

export type CumulativeStats = {
  total_steps: number;
  total_distance_walked_m: number;
  total_distance_run_m: number;
  total_gym_sessions: number;
  total_focus_secs: number;
  total_habits_completed: number;
  total_books_finished: number;
  total_movies_watched: number;
  longest_streak_ever: number;
};

const EMPTY_CUMULATIVE_STATS: CumulativeStats = {
  total_steps: 0, total_distance_walked_m: 0, total_distance_run_m: 0, total_gym_sessions: 0,
  total_focus_secs: 0, total_habits_completed: 0, total_books_finished: 0, total_movies_watched: 0,
  longest_streak_ever: 0,
};

/** Read-only view of the row incrementCumulativeStats() above writes — for the profile/stats page. */
export async function getCumulativeStats(): Promise<CumulativeStats> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return EMPTY_CUMULATIVE_STATS;
  const { data } = await supabase.from('cumulative_stats').select('*').eq('user_id', userId).maybeSingle();
  return data ? { ...EMPTY_CUMULATIVE_STATS, ...data } : EMPTY_CUMULATIVE_STATS;
}

// updateUserContextSummary USED to live here, running on every domain write
// — a sip of water triggered a 130-row Supabase fetch (100 tasks + 30
// workouts) to regenerate a 5-line summary. An audit (2026-07-06) called
// this the worst cost/value ratio in the codebase and moved it to
// supabase/functions/daily-briefing/index.ts instead, where it runs once
// per briefing (organically ~once/day) rather than once per write. See
// that file for the current implementation.
