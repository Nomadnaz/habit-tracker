// ─────────────────────────────────────────────────────────────────────────
// postWrite.ts — Centralized side-effect orchestration
// ─────────────────────────────────────────────────────────────────────────
// Called after ANY domain write (task, workout, habit, etc.).
// Runs 6 side effects in parallel; one failure doesn't block others.
// ─────────────────────────────────────────────────────────────────────────

import { updateStreak } from './streaks';
import { supabase } from './supabase';
import { toDateKey } from './dateKey';
import { checkAndAwardBadges } from './badges';

export type Entity = 'task' | 'workout' | 'habit' | 'water' | 'weight' | 'sleep' | 'meal' | 'medication' | 'activity' | 'goal';
export type Action = 'create' | 'update' | 'delete';

export async function postWrite(entity: Entity, record: any, action: Action): Promise<void> {
  // updateStreak runs FIRST and is awaited on its own: checkBadges (streak_7/
  // streak_30/workouts_10, etc.) reads state updateStreak just wrote
  // (record.streak, @body.workoutsTotal) — running everything in one
  // Promise.allSettled would race the two with no guaranteed order.
  await updateStreak(entity, record).catch(err => console.warn('postWrite updateStreak failed:', err));

  const effects = [
    incrementCumulativeStats(entity, record, action),
    checkBadges(entity, record),
    addFriendFeedEvent(entity, record), // stub — task 070/socials FUTURE
    writeObsidian(entity, record), // stub — task 058/059, needs iCloud (device-gated)
    updateUserContextSummary(record),
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
  if (action !== 'create') return; // only count new occurrences, not edits/deletes
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const delta: Record<string, number> = {};
    if (entity === 'habit' && record.completed) delta.total_habits_completed = 1;
    if (entity === 'workout') delta.total_gym_sessions = 1;
    if (entity === 'activity') {
      const meters = typeof record.distanceM === 'number' ? record.distanceM : 0;
      if (record.type === 'run') delta.total_distance_run_m = meters;
      else delta.total_distance_walked_m = meters; // hike + walk both count as walked distance
    }
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

async function updateUserContextSummary(record: any): Promise<void> {
  try {
    // getSession() returns { data: { session } } — the previous code destructured
    // it as { data: session }, so userId was ALWAYS undefined and this effect
    // silently no-op'd. Fixed.
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;

    const today = toDateKey(new Date());

    // Fetch latest stats to regenerate the personal-context profile.
    const { data: tasks } = await supabase
      .from('tasks')
      .select('date')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: workouts } = await supabase
      .from('workout_done_log')
      .select('date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);

    const tasksTodayCount = tasks?.filter((t: any) => t.date === today).length ?? 0;

    // Canonical schema (006_ai_companions.sql): user_context_summary holds
    // profile_md / assistant_notes_md (personal-context layer, task 057) — NOT a
    // generic context_json column (the old code wrote a column that doesn't exist).
    // buildContext reads profile_md, so keep this human/model-readable markdown.
    const profileMd = [
      `Tasks tracked: ${tasks?.length ?? 0} (recent).`,
      `Tasks today (${today}): ${tasksTodayCount}.`,
      `Workouts logged: ${workouts?.length ?? 0} (recent).`,
      tasks?.[0]?.date ? `Last task date: ${tasks[0].date}.` : null,
      workouts?.[0]?.date ? `Last workout date: ${workouts[0].date}.` : null,
    ].filter(Boolean).join('\n');

    const now = new Date().toISOString();
    await supabase.from('user_context_summary').upsert(
      {
        user_id: userId,
        profile_md: profileMd,
        profile_updated_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );
  } catch (err) {
    console.error('updateUserContextSummary error:', err);
    throw err;
  }
}
