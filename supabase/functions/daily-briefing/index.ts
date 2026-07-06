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

    return new Response(JSON.stringify({ briefing: briefing || 'Nothing to report yet today.', generatedAt }), {
      status: 200,
      headers: cors,
    });
  } catch (err) {
    console.error('daily-briefing error:', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: cors });
  }
});
