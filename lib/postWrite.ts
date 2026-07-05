// ─────────────────────────────────────────────────────────────────────────
// postWrite.ts — Centralized side-effect orchestration
// ─────────────────────────────────────────────────────────────────────────
// Called after ANY domain write (task, workout, habit, etc.).
// Runs 6 side effects in parallel; one failure doesn't block others.
// ─────────────────────────────────────────────────────────────────────────

import { updateStreak } from './streaks';
import { supabase } from './supabase';
import { toDateKey } from './dateKey';

export type Entity = 'task' | 'workout' | 'habit' | 'water' | 'weight' | 'sleep' | 'meal' | 'medication' | 'activity';
export type Action = 'create' | 'update' | 'delete';

export async function postWrite(entity: Entity, record: any, action: Action): Promise<void> {
  const effects = [
    incrementCumulativeStats(entity, record, action),
    updateStreak(entity, record),
    checkBadges(entity, record), // stub
    addFriendFeedEvent(entity, record), // stub
    writeObsidian(entity, record), // stub
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
  try {
    // Stub: would increment cumulative_stats table
    // For now, just log
    console.log(`incrementCumulativeStats: ${entity} ${action}`, record);
  } catch (err) {
    console.error('incrementCumulativeStats error:', err);
    throw err;
  }
}

async function checkBadges(entity: Entity, record: any): Promise<void> {
  // Stub: would check if user unlocked any badges
  console.log('checkBadges stub:', entity);
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
