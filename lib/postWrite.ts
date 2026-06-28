// ─────────────────────────────────────────────────────────────────────────
// postWrite.ts — Centralized side-effect orchestration
// ─────────────────────────────────────────────────────────────────────────
// Called after ANY domain write (task, workout, habit, etc.).
// Runs 6 side effects in parallel; one failure doesn't block others.
// ─────────────────────────────────────────────────────────────────────────

import { updateStreak } from './streaks';
import { supabase } from './supabase';

export type Entity = 'task' | 'workout' | 'habit' | 'water' | 'weight' | 'sleep' | 'meal';
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
    const { data: session } = await supabase.auth.getSession();
    if (!session?.user?.id) return;

    const userId = session.user.id;

    // Fetch latest stats to update context
    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: workouts } = await supabase
      .from('workout_done_log')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(30);

    const contextJson = {
      tasksTotal: tasks?.length || 0,
      tasksTodayCount: tasks?.filter((t: any) => t.date === new Date().toISOString().split('T')[0]).length || 0,
      workoutsThisMonth: workouts?.length || 0,
      lastTaskDate: tasks?.[0]?.date,
      lastWorkoutDate: workouts?.[0]?.date,
      updatedAt: new Date().toISOString(),
    };

    // Insert or update user_context_summary
    await supabase.from('user_context_summary').upsert({
      user_id: userId,
      context_json: contextJson,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('updateUserContextSummary error:', err);
    throw err;
  }
}
