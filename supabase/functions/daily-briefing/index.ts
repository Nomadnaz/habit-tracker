// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/daily-briefing/index.ts — daily briefing (task 019)
//
// Contract:
//   POST  Authorization: Bearer <user JWT>
//   → { briefing: string, generatedAt: string }
//
// Reads briefing_preferences.selected_modules[] and queries buildContext with
// ONLY those sources — a module the user hasn't opted into is never touched,
// which is both a privacy property (buildContext runs with the service-role
// client, bypassing RLS) and a cost property (fewer queries, smaller prompt).
// Calls claude-haiku-4-5 for a single <150-word summary. No conversation
// history, no actions — this is a one-shot read, not a chat turn.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { buildContext } from '../_shared/buildContext.ts';
import { localDateKey } from '../_shared/localDate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// Sensible default for a user who hasn't picked briefing modules yet
// (onboarding's briefing-builder screen, task 062, isn't built — until then,
// everyone gets a reasonable baseline instead of an empty briefing).
const DEFAULT_MODULES = ['tasks', 'habit_logs'];

// This had NO rate limit at all before an audit (2026-07-06) flagged it as
// an open cost hole: any authed user could loop this endpoint, and each
// call runs buildContext's full query fan-out plus a Haiku call on the
// app's shared key. A briefing is meant to be requested ~once/day (plus
// occasional manual refreshes) — 10/day is generous headroom for that,
// configurable via the BRIEFING_DAILY_CAP secret without a redeploy.
const BRIEFING_DAILY_CAP = Number(Deno.env.get('BRIEFING_DAILY_CAP') ?? '10');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

/**
 * Regenerates user_context_summary.profile_md (the personal-context layer,
 * task 057) — a short markdown summary buildContext's user_context_summary
 * source reads back into other companions' prompts. This USED to run inside
 * lib/postWrite.ts on EVERY domain write (a sip of water triggered a
 * 130-row Supabase fetch to regenerate 5 lines of near-zero-new-information
 * text) — an audit (2026-07-06) called it the worst cost/value ratio in the
 * codebase and moved it here, where it runs once per briefing generation
 * (organically ~once/day, plus manual refreshes) instead of once per write.
 * Reuses ctx.raw.tasks/workout_done_log when the user's selected briefing
 * modules already fetched them; otherwise does one small dedicated query
 * each, same reuse pattern as buildContext's precomputed-flags section.
 * Fire-and-forget from the caller — never blocks the briefing response.
 */
async function updateUserContextSummary(
  admin: SupabaseClient,
  userId: string,
  ctxRaw: Record<string, unknown>,
  tzOffsetMinutes: number,
): Promise<void> {
  try {
    const today = localDateKey(tzOffsetMinutes);

    const tasks = Array.isArray(ctxRaw.tasks)
      ? (ctxRaw.tasks as Array<{ date: string }>)
      : ((await admin.from('tasks').select('date').eq('user_id', userId)
          .order('created_at', { ascending: false }).limit(100)).data as Array<{ date: string }> | null) ?? [];

    const workouts = Array.isArray(ctxRaw.workout_done_log)
      ? (ctxRaw.workout_done_log as Array<{ date: string }>)
      : ((await admin.from('workout_done_log').select('date').eq('user_id', userId)
          .order('date', { ascending: false }).limit(30)).data as Array<{ date: string }> | null) ?? [];

    const tasksTodayCount = tasks.filter(t => t.date === today).length;

    const profileMd = [
      `Tasks tracked: ${tasks.length} (recent).`,
      `Tasks today (${today}): ${tasksTodayCount}.`,
      `Workouts logged: ${workouts.length} (recent).`,
      tasks[0]?.date ? `Last task date: ${tasks[0].date}.` : null,
      workouts[0]?.date ? `Last workout date: ${workouts[0].date}.` : null,
    ].filter(Boolean).join('\n');

    const now = new Date().toISOString();
    await admin.from('user_context_summary').upsert(
      { user_id: userId, profile_md: profileMd, profile_updated_at: now, updated_at: now },
      { onConflict: 'user_id' },
    );
  } catch (err) {
    console.error('updateUserContextSummary error:', err);
  }
}

// Task 060: remember_about_user (actionExecutor.ts) only hard-caps
// assistant_notes_md at 30 bullets — old facts silently roll off rather than
// being condensed, so a long-lived note (e.g. "allergic to X") can get pushed
// out by newer trivia. Once the notes block is long enough to be worth the
// Haiku call, condense it into fewer, denser bullets instead of just
// truncating. ~4 chars/token is the same rough estimate used elsewhere in
// this codebase; 7000 chars ≈ 1.75k tokens, inside the task's ~1.5-2k range.
const NOTES_RESUMMARIZE_CHAR_THRESHOLD = 7000;

async function resummarizeAssistantNotes(
  admin: SupabaseClient,
  anthropic: Anthropic,
  userId: string,
  notesMd: string,
): Promise<void> {
  try {
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system:
        'Condense these saved notes about a user into a shorter bullet list ("- fact"), one fact per line. Merge duplicates and superseded entries, drop anything now redundant, but preserve every distinct fact — never invent or omit information. Output ONLY the bullet list, nothing else.',
      messages: [{ role: 'user', content: notesMd }],
    });
    const condensed = completion.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();
    if (!condensed) return;
    await admin.from('user_context_summary').upsert(
      { user_id: userId, assistant_notes_md: condensed, notes_updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  } catch (err) {
    console.error('resummarizeAssistantNotes error:', err);
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
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    // Client's `new Date().getTimezoneOffset()` — see _shared/localDate.ts.
    // Without this, TODAY/tomorrow's-gym-session in the briefing text could
    // name the wrong calendar day for anyone west of UTC (audit 2026-07-06).
    const tzOffsetMinutes: number = typeof body.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : 0;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Rate limit FIRST, before any buildContext query or Claude call — an
    // atomic increment-and-return-new-count RPC (supabase/migrations/
    // 024_api_usage_increment.sql), so a burst of concurrent requests can't
    // all read the same pre-increment count and all pass (the race
    // ai-chat's own read-then-write check still has, see that file's notes).
    // A rejected request still consumes one from the day's allowance —
    // deliberately conservative, discourages retry-spam rather than
    // rewarding it.
    const day = new Date().toISOString().slice(0, 10);
    const { data: newBriefingCount } = await admin.rpc('increment_briefing_usage', {
      p_user_id: userId,
      p_date: day,
    });
    if (typeof newBriefingCount === 'number' && newBriefingCount > BRIEFING_DAILY_CAP) {
      return new Response(JSON.stringify({ error: 'daily briefing limit reached' }), { status: 429, headers: cors });
    }

    const { data: prefs } = await admin
      .from('briefing_preferences')
      .select('selected_modules')
      .eq('user_id', userId)
      .maybeSingle();
    const selectedModules: string[] = prefs?.selected_modules?.length ? prefs.selected_modules : DEFAULT_MODULES;

    const ctx = await buildContext(admin, userId, selectedModules, tzOffsetMinutes);

    const systemPrompt = `You write a single short daily briefing for a habit-tracking app user, grounded ONLY in the context below — never invent tasks, numbers, or streaks that aren't present. Under 150 words. Plain prose, no headers, no bullet points, second person ("you have..."). If the context is sparse, keep it brief rather than padding.

Context:
${ctx.text}`;

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Write today\'s briefing.' }],
    });

    const briefing = completion.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('')
      .trim();

    const generatedAt = new Date().toISOString();

    // Fire-and-forget — never delays or fails the briefing response.
    updateUserContextSummary(admin, userId, ctx.raw, tzOffsetMinutes).catch(() => {});
    (async () => {
      const existingNotes = ctx.raw.user_context_summary
        ? (ctx.raw.user_context_summary as { assistant_notes_md?: string } | null)?.assistant_notes_md
        : (await admin.from('user_context_summary').select('assistant_notes_md').eq('user_id', userId).maybeSingle())
            .data?.assistant_notes_md;
      if (existingNotes && existingNotes.length >= NOTES_RESUMMARIZE_CHAR_THRESHOLD) {
        await resummarizeAssistantNotes(admin, anthropic, userId, existingNotes);
      }
    })().catch(() => {});

    return new Response(JSON.stringify({ briefing: briefing || 'Nothing to report yet today.', generatedAt }), {
      status: 200,
      headers: cors,
    });
  } catch (err) {
    console.error('daily-briefing error:', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: cors });
  }
});
