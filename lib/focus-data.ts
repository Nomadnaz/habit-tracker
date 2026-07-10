// ─────────────────────────────────────────────────────────────────────────
// lib/focus-data.ts — Focus session history (Code Audit v2 fix plan, P2/B3)
//
// Before this, the app's focus timer (app/focus-timer.tsx) only persisted to
// AsyncStorage (lib/focus-session.ts) — it never wrote focus_sessions (the
// device already does, migration 026) and never called postWrite, so
// cumulative_stats.total_focus_secs never moved and no AI companion could
// ever answer "how much did I focus this week?". Fire-and-forget, local-first
// like every other domain — the timer's own AsyncStorage state stays the UI's
// source of truth.
// ─────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';
import { toDateKey } from './dateKey';
import { postWrite } from './postWrite';

function genId() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
async function getUid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
function bg(fn: () => Promise<unknown>) { fn().catch(() => {}); }

/** Call once a focus (work) interval completes. Fire-and-forget. */
export function logFocusSession(durationMins: number): void {
  if (durationMins <= 0) return;
  bg(async () => {
    const userId = await getUid();
    if (!userId) return;
    const row = {
      id: genId(),
      user_id: userId,
      date: toDateKey(new Date()),
      duration_mins: Math.round(durationMins),
      source: 'app' as const,
    };
    const { error } = await supabase.from('focus_sessions').insert(row);
    if (error) return;
    await postWrite('focus', { durationSecs: Math.round(durationMins) * 60 }, 'create');
  });
}
