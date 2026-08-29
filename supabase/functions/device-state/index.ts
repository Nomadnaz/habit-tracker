// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/device-state/index.ts — Companion HUD device sync
//
// One contract for both transports (phone BLE relay today, device Wi-Fi
// direct later):
//   GET  ?tz=<tzOffsetMinutes>   Authorization: Bearer <user JWT>
//     → compact JSON snapshot (~1-2 KB) the device renders directly
//   POST Authorization: Bearer <user JWT>
//     body: { tzOffsetMinutes?, actions: [{op, ...}] }
//     → { results: [{op, ok, error?}] }
//
// The firmware never learns table schemas — it renders the snapshot and
// emits named actions; all validation and writes happen here. Queries are
// adapted from _shared/buildContext.ts but return structured JSON instead
// of prose (the device is a renderer, not a model).
//
// Actions: complete_task, toggle_habit, gym_checkin, log_focus_session,
// capture_note, log_set. capture_note lands in vault_inbox (migration 027)
// for the Mac vault agent to materialise as an Obsidian Inbox/ note — the AI
// reads vault_files only, never a filesystem (vault canon). log_set is
// emitted by the rep-sensor firmware on LIFT_DONE (screen_lift.c) — see
// _shared/exercises.ts + _shared/actionExecutor.ts's log_set for the name
// resolution + estimated-1RM PB check it shares with the voice path.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import { localDateKey, localWeekday } from '../_shared/localDate.ts';
import { resolveExerciseId } from '../_shared/exercises.ts';
import { processActions } from '../_shared/actionExecutor.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

// deno-lint-ignore no-explicit-any
type Admin = any;

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

async function buildSnapshot(admin: Admin, userId: string, tz: number) {
  const today = localDateKey(tz);
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();
  const todayName = WEEKDAYS[localWeekday(tz)];

  const [tasksQ, habitsQ, logsQ, streaksQ, gymPlanQ, gymDoneQ, actsQ, focusQ, vaultQ, vaultCountQ, inboxQ] =
    await Promise.all([
      admin.from('tasks')
        .select('id, label, date, hour, minute, done')
        .eq('user_id', userId).eq('archived', false).eq('date', today)
        .order('hour', { ascending: true, nullsFirst: false }).limit(10),
      admin.from('habits').select('id, name').eq('user_id', userId).eq('active', true).limit(10),
      admin.from('habit_logs').select('habit_id, completed')
        .eq('user_id', userId).eq('date', today),
      admin.from('streak_data').select('habit_id, current_streak').eq('user_id', userId),
      admin.from('gym_plan').select('*').eq('user_id', userId).maybeSingle(),
      admin.from('workout_done_log').select('date, duration_mins')
        .eq('user_id', userId).eq('date', today).limit(1),
      admin.from('activities')
        .select('type, start_time, distance_m, duration_secs')
        .eq('user_id', userId).gte('start_time', weekAgoIso)
        .order('start_time', { ascending: false }).limit(10),
      admin.from('focus_sessions').select('duration_mins')
        .eq('user_id', userId).eq('date', today),
      admin.from('vault_files').select('path, updated_at')
        .eq('user_id', userId).is('deleted_at', null)
        .order('updated_at', { ascending: false }).limit(3),
      admin.from('vault_files').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).is('deleted_at', null),
      admin.from('vault_inbox').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).is('synced_at', null),
    ]);

  const tasks = (tasksQ.data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id, label: t.label, done: t.done, hour: t.hour, minute: t.minute,
  }));

  const doneToday = new Set(
    (logsQ.data ?? []).filter((l: { completed: boolean }) => l.completed)
      .map((l: { habit_id: string }) => l.habit_id),
  );
  const streakBy = new Map(
    (streaksQ.data ?? []).map((s: { habit_id: string; current_streak: number }) => [s.habit_id, s.current_streak]),
  );
  const habits = (habitsQ.data ?? []).map((h: { id: string; name: string }) => ({
    id: h.id, name: h.name, done: doneToday.has(h.id), streak: streakBy.get(h.id) ?? 0,
  }));

  // HUB "next": first not-done timed task later today, else first not-done.
  const pending = tasks.filter((t: { done: boolean }) => !t.done);
  const next = pending.find((t: { hour: number | null }) => t.hour != null) ?? pending[0] ?? null;

  const acts = actsQ.data ?? [];
  const last = acts[0] ?? null;
  const weekKm = acts.reduce((s: number, a: { distance_m?: number }) => s + (a.distance_m ?? 0), 0) / 1000;

  const focusMin = (focusQ.data ?? []).reduce(
    (s: number, f: { duration_mins?: number }) => s + (f.duration_mins ?? 0), 0);

  // vault_inbox may not exist until migration 027 is applied — degrade to 0.
  const inboxPending = typeof inboxQ.count === 'number' ? inboxQ.count : 0;

  return {
    v: 1,
    ts: Date.now(),
    date: today,
    tasks,
    habits,
    gym: {
      today_plan: gymPlanQ.data ? (gymPlanQ.data[todayName] || null) : null,
      done_today: (gymDoneQ.data ?? []).length > 0,
    },
    run: {
      last: last ? {
        type: last.type,
        km: Math.round(((last.distance_m ?? 0) / 1000) * 100) / 100,
        mins: Math.round((last.duration_secs ?? 0) / 60),
        date: String(last.start_time).slice(0, 10),
      } : null,
      week_km: Math.round(weekKm * 10) / 10,
    },
    hub: {
      next: next ? { label: next.label, hour: next.hour, minute: next.minute } : null,
      tasks_done: tasks.length - pending.length,
      tasks_total: tasks.length,
      focus_min_today: focusMin,
    },
    brain: {
      files: vaultCountQ.count ?? 0,
      recent: (vaultQ.data ?? []).map((f: { path: string }) =>
        String(f.path).split('/').pop()?.replace(/\.md$/, '') ?? f.path),
      inbox_pending: inboxPending,
    },
  };
}

// deno-lint-ignore no-explicit-any
type Action = Record<string, any>;

async function applyAction(admin: Admin, userId: string, tz: number, a: Action):
  Promise<{ op: string; ok: boolean; error?: string }> {
  const op = String(a.op ?? '');
  const today = localDateKey(tz);
  try {
    switch (op) {
      case 'complete_task': {
        if (!a.id) return { op, ok: false, error: 'id required' };
        const { error } = await admin.from('tasks')
          .update({ done: a.done !== false })
          .eq('user_id', userId).eq('id', String(a.id));
        return { op, ok: !error, error: error?.message };
      }
      case 'toggle_habit': {
        if (!a.id) return { op, ok: false, error: 'id required' };
        const habitId = String(a.id);
        const { data: existing } = await admin.from('habit_logs')
          .select('id, completed')
          .eq('user_id', userId).eq('habit_id', habitId).eq('date', today)
          .maybeSingle();
        if (existing) {
          const { error } = await admin.from('habit_logs')
            .update({ completed: !existing.completed }).eq('id', existing.id);
          return { op, ok: !error, error: error?.message };
        }
        const { error } = await admin.from('habit_logs').insert({
          id: crypto.randomUUID(), user_id: userId, habit_id: habitId,
          date: today, completed: true,
        });
        return { op, ok: !error, error: error?.message };
      }
      case 'gym_checkin': {
        // workout_template_id is NOT NULL with a per-day uniqueness constraint;
        // the device has no template concept, so a fixed sentinel id both
        // satisfies the schema and makes repeat check-ins the same day no-ops.
        const { data: existing } = await admin.from('workout_done_log')
          .select('id').eq('user_id', userId).eq('date', today)
          .eq('workout_template_id', 'device-checkin').maybeSingle();
        if (existing) return { op, ok: true };
        const { error } = await admin.from('workout_done_log').insert({
          id: crypto.randomUUID(), user_id: userId,
          workout_template_id: 'device-checkin', date: today,
          duration_mins: typeof a.duration_mins === 'number' ? a.duration_mins : null,
        });
        return { op, ok: !error, error: error?.message };
      }
      case 'log_focus_session': {
        const mins = Number(a.mins);
        if (!Number.isFinite(mins) || mins <= 0 || mins > 24 * 60) {
          return { op, ok: false, error: 'mins required (1-1440)' };
        }
        const { error } = await admin.from('focus_sessions').insert({
          id: crypto.randomUUID(), user_id: userId, date: today,
          duration_mins: Math.round(mins), source: 'device',
        });
        return { op, ok: !error, error: error?.message };
      }
      // Emitted by screen_lift.c on LIFT_DONE -- weight_kg is always
      // spoken/typed (lift_begin's argument), reps/rom_cm/peak_velocity_mps/
      // tempo_seconds are always measured by the rep-sensor firmware. The
      // firmware only knows the exercise NAME (no ID concept), same as
      // device-log's voice path -- reuse the same resolver so "squats" means
      // the same thing whichever transport said it. The actual write (+
      // estimated-1RM PB check) reuses _shared/actionExecutor.ts's log_set
      // rather than a third copy of that logic.
      //
      // Unlike device-log's voice path, an unresolved name here is
      // auto-created rather than rejected: this name came verbatim from
      // firmware (today, literally "TEST SET" from the calibration button;
      // later, whatever the user typed/said), not from a model that could
      // have misheard or hallucinated a different real exercise. There is no
      // "wrong exercise" risk to guard against, only "new exercise" -- and
      // silently dropping every device-measured set until voice-driven
      // lift_begin() exists would make this whole path untestable on
      // hardware in the meantime.
      case 'log_set': {
        const exerciseName = String(a.exercise ?? '').trim();
        if (!exerciseName) return { op, ok: false, error: 'exercise required' };
        const weightKg = Number(a.weight_kg);
        const reps = Number(a.reps);
        if (!Number.isFinite(weightKg) || !Number.isFinite(reps) || reps <= 0) {
          return { op, ok: false, error: 'weight_kg + reps required' };
        }
        let exerciseId = await resolveExerciseId(admin, userId, exerciseName);
        if (!exerciseId) {
          const newId = crypto.randomUUID();
          const { error: createErr } = await admin.from('exercises')
            .insert({ id: newId, user_id: userId, name: exerciseName });
          if (createErr) return { op, ok: false, error: createErr.message };
          exerciseId = newId;
        }

        const data: Record<string, unknown> = { exerciseId, weightKg, reps, date: today, source: 'device' };
        if (Number.isFinite(Number(a.rom_cm))) data.romCm = Number(a.rom_cm);
        if (Number.isFinite(Number(a.peak_velocity_mps))) data.peakVelocityMps = Number(a.peak_velocity_mps);
        if (Number.isFinite(Number(a.tempo_seconds))) data.tempoSeconds = Number(a.tempo_seconds);

        const [result] = await processActions(
          admin, userId, [{ type: 'log_set', confidence: 1, data }], { execute: true, tzOffsetMinutes: tz },
        );
        return { op, ok: result.status === 'executed', error: result.status === 'executed' ? undefined : result.message };
      }
      case 'capture_note': {
        const text = String(a.text ?? '').trim();
        if (!text) return { op, ok: false, error: 'text required' };
        const { error } = await admin.from('vault_inbox').insert({
          id: crypto.randomUUID(), user_id: userId, text: text.slice(0, 4000),
          source: 'device',
        });
        return { op, ok: !error, error: error?.message };
      }
      default:
        return { op, ok: false, error: 'unsupported op' };
    }
  } catch (e) {
    return { op, ok: false, error: String(e) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: cors });
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (req.method === 'GET') {
      const tz = Number(new URL(req.url).searchParams.get('tz') ?? '0') || 0;
      const snapshot = await buildSnapshot(admin, user.id, tz);
      return new Response(JSON.stringify(snapshot), { status: 200, headers: cors });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const tz = typeof body.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : 0;
      const actions: Action[] = Array.isArray(body.actions) ? body.actions.slice(0, 20) : [];
      if (!actions.length) {
        return new Response(JSON.stringify({ error: 'actions required' }), { status: 400, headers: cors });
      }
      const results = [];
      for (const a of actions) results.push(await applyAction(admin, user.id, tz, a));
      return new Response(JSON.stringify({ results }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: cors });
  } catch (err) {
    console.error('device-state error:', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: cors });
  }
});
