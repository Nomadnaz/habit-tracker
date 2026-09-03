// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/ai-chat/index.ts — companion chat Edge Function (task 013)
//
// Contract (the device + the app both call this):
//   POST  Authorization: Bearer <user JWT>
//   body: { message: string, companionType?: string, conversationHistory?: [] }
//   → { response: string, actions: object[] }
//
// Pipeline: derive userId from JWT → rate-limit (api_usage) → buildContext →
// buildSystemPrompt (persona + context, prompt-cached) → Claude → extractActions
// → persist to companion_messages + increment api_usage.
//
// Model: Haiku 4.5 default (Sonnet 4.6 for complex) — current IDs, NOT the
// retired claude-3-5-* strings. Prompt caching is mandatory (system-model.md).
// The Anthropic key lives ONLY as a Supabase function secret; never client-side.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { companions, MODEL_IDS, DEFAULT_COMPANION } from '../_shared/companions.ts';
import { buildContext } from '../_shared/buildContext.ts';
import { processActions, ACTION_SPECS, type CompanionAction } from '../_shared/actionExecutor.ts';
import { getUserApiKey } from '../_shared/byok.ts';
import { localDateKey } from '../_shared/localDate.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

// Server-side daily message ceiling. Configurable via the FREE_DAILY_CAP
// function secret so it can be tuned without a redeploy. Defaults to the
// production free-tier cap system-model.md specifies (25/day) — set the
// FREE_DAILY_CAP secret higher during development if 25 is too tight for
// testing, rather than leaving a dev-convenience default live in prod
// (an audit, 2026-07-06, found this defaulted to 500 — ~$1.75/user/day
// worst case at Haiku pricing).
const FREE_DAILY_CAP = Number(Deno.env.get('FREE_DAILY_CAP') ?? '25');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

function extractActions(text: string): CompanionAction[] {
  const actions: CompanionAction[] = [];
  const re = /<action>([\s\S]*?)<\/action>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed && typeof parsed.type === 'string') actions.push(parsed as CompanionAction);
    } catch { /* ignore malformed */ }
  }
  return actions;
}

// Strip the <action> blocks out of the user-visible text.
const cleanText = (text: string) => text.replace(/<action>[\s\S]*?<\/action>/g, '').trim();

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: cors });
    }

    // 1. Derive (and validate) userId from the caller's JWT.
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: cors });
    }
    const userId = user.id;

    const body = await req.json().catch(() => ({}));
    const message: string = (body.message ?? '').toString().trim();
    if (!message) {
      return new Response(JSON.stringify({ error: 'message required' }), { status: 400, headers: cors });
    }
    const companionType: string = companions[body.companionType] ? body.companionType : DEFAULT_COMPANION;
    // ble-bridge.ts sends this when the request came from the voice device
    // rather than the in-app chat screen -- see the device-terseness addendum
    // below. The app's own ChatScreen never sets it, so its replies are
    // unaffected.
    const isDevice: boolean = body.source === 'device';
    const history: { role: 'user' | 'assistant'; content: string }[] =
      Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-10) : [];
    // Client's `new Date().getTimezoneOffset()` — see _shared/localDate.ts.
    // Defaults to 0 (UTC) for callers that don't send it yet (the voice
    // device / tools/phone_sim.py), same as before this fix, not worse.
    const tzOffsetMinutes: number = typeof body.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : 0;

    // Service-role client for context reads + persistence (bypasses RLS, scoped by userId).
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 2. Server-side rate limit.
    const day = localDateKey(tzOffsetMinutes);
    const { data: usage } = await admin
      .from('api_usage')
      .select('message_count')
      .eq('user_id', userId)
      .eq('date', day)
      .maybeSingle();
    if ((usage?.message_count ?? 0) >= FREE_DAILY_CAP) {
      return new Response(JSON.stringify({ error: 'daily limit reached' }), { status: 429, headers: cors });
    }

    // 3. buildContext — the grounding step.
    const cfg = companions[companionType];
    const ctx = await buildContext(admin, userId, cfg.contextSources, tzOffsetMinutes, message);

    // 3b. Per-user persona customisation (companion_personas, task 020's
    // Settings screen writes to this table) — previously fetched-but-ignored,
    // so a custom name set in Settings never showed up in chat (audit
    // 2026-07-06: the template always used cfg.defaultName).
    const { data: persona } = await admin
      .from('companion_personas')
      .select('name, user_nickname')
      .eq('user_id', userId)
      .eq('companion_type', companionType)
      .maybeSingle();
    const companionName = persona?.name || cfg.defaultName;
    const nickname = persona?.user_nickname || user.user_metadata?.name || 'there';

    // 4. buildSystemPrompt (persona + context + the actions this companion may
    // emit). Inlined for v1; task 011 extracts it. Spelling out the exact action
    // names/schema is what makes the model reliably emit a usable <action> block.
    const allowedActions = (cfg.actions ?? []).map((a: string) => ACTION_SPECS[a]).filter(Boolean);
    const actionGuide = allowedActions.length
      ? `\n\nACTIONS YOU CAN TAKE (besides your normal reply, emit at most one <action> block per requested change, with the JSON on a single line):\n${allowedActions.map((s: string) => `- ${s}`).join('\n')}\n\nRules:\n- Only emit an action when the user clearly asks you to change their data.\n- For an explicit, unambiguous request (e.g. "add a task to call mum tomorrow at 6pm"), set "confidence": 0.95 so it happens immediately.\n- If you are unsure which task they mean or details are missing, use a lower "confidence" (0.6-0.8) so they can confirm first.${isDevice ? ' EXCEPT from the device (see DEVICE MODE below): it has no confirm screen, so use 0.85+ and your best-guess interpretation instead of a low confidence -- a gated, unconfirmed action here just reads back as a question nobody can answer.' : ''}\n- For reschedule_task / complete_task, use the exact id shown in TASKS.\n- Resolve relative dates against TODAY above.`
      : '';
    // Device calls reach here only when device-log's own classifier couldn't
    // confidently turn the utterance into a write (see device-log/index.ts) --
    // a genuine question, or something ambiguous enough that device-log gave
    // up. Either way, this device has no screen to hold a back-and-forth on
    // and no way to hear a follow-up question: it shows one line, then
    // closes. A normal chatty reply ("is this a snack? what size?") is a
    // dead end here, not a clarification -- there's no next turn for the
    // user to answer into. Force a single short, direct line instead: best
    // guess and act, or answer as tightly as possible.
    const deviceAddendum = isDevice
      ? '\n\nDEVICE MODE: this message came from a voice device with a one-line display and no way to hear a reply to a question. NEVER ask a clarifying question -- make the single most reasonable assumption and answer directly. Reply in ONE short sentence, ideally under 12 words. No lists, no multi-part explanations.'
      : '';
    const systemPrompt = cfg.systemPromptTemplate
      .replace('{name}', companionName)
      .replace('{user_nickname}', nickname)
      .replace('{context}', ctx.text) + actionGuide + deviceAddendum;

    // 5. Claude call — prompt caching on the system+context prefix (mandatory).
    // BYOK: use the user's own saved Anthropic key when present (task 020),
    // falling back to the app's shared key. Previously saved-but-never-read
    // (audit 2026-07-06: the Settings toggle silently did nothing).
    const userKey = await getUserApiKey(admin, userId);
    const anthropic = new Anthropic({ apiKey: userKey ?? ANTHROPIC_API_KEY });
    const modelId = MODEL_IDS[cfg.model];
    const completion = await anthropic.messages.create({
      model: modelId,
      max_tokens: 1024,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ],
    });

    const rawText = completion.content
      .filter((b: { type: string }) => b.type === 'text')
      .map((b: { text: string }) => b.text)
      .join('');
    let responseText = cleanText(rawText);
    // 5b. Gate every emitted action (tasks 012/039). The app is LOCAL-FIRST, so
    // it performs the actual writes itself (on-device store + Supabase + Apple);
    // here we only return each action's gate decision ('auto' / 'preview' /
    // 'clarify' / 'unsupported'). Server-side execution is available via
    // { execute: true } in the body for clients with no local store.
    const parsedActions = extractActions(rawText);
    // Diagnostic: surfaces in Supabase dashboard → Edge Functions → Logs.
    console.log('[ai-chat] parsed actions:', JSON.stringify(parsedActions));
    const actions = parsedActions.length
      ? await processActions(admin, userId, parsedActions, { execute: body.execute === true, tzOffsetMinutes })
      : [];

    // The model sometimes replies with ONLY an <action> block (no prose), which
    // would leave the device's ASK screen showing "...". Always give the caller
    // a human sentence by summarising what happened.
    if (!responseText && actions.length) {
      responseText = actions
        .map((a) => {
          const label = (a.result?.label as string) ?? (a.data?.label as string) ?? (a.data?.title as string);
          const date = (a.result?.date as string) ?? (a.data?.date as string);
          if (a.status === 'executed' || a.status === 'auto') {
            if (a.type === 'create_task' && label) return `Added "${label}"${date ? ` for ${date}` : ''}.`;
            return 'Done.';
          }
          if (a.status === 'preview') return `Tap to confirm: ${a.type.replace(/_/g, ' ')}.`;
          if (a.status === 'clarify') return a.message ?? 'Can you give me a bit more detail?';
          return '';
        })
        .filter(Boolean)
        .join(' ');
    }
    if (!responseText) responseText = 'Done.';
    // Safety net, not the primary fix: the DEVICE MODE instruction above is
    // what actually stops the model rambling, but instructions aren't a
    // hard guarantee. Cut at the nearest sentence/word boundary under the
    // cap rather than mid-word -- the firmware's own budget is 220 bytes
    // (screen_ask.c's ASK_TEXT_MAX), this stays well under that with room
    // for a pipe-delimited stat suffix from other callers.
    if (isDevice && responseText.length > 140) {
      const cut = responseText.slice(0, 140);
      const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
      const lastSpace = cut.lastIndexOf(' ');
      responseText = lastStop > 40 ? cut.slice(0, lastStop + 1) : cut.slice(0, lastSpace > 0 ? lastSpace : 140);
    }

    const tokensIn = completion.usage?.input_tokens ?? null;
    const tokensOut = completion.usage?.output_tokens ?? null;

    // 6. Persist the exchange + increment usage (best-effort; never block the reply).
    const now = new Date().toISOString();
    await Promise.allSettled([
      admin.from('companion_messages').insert([
        { id: crypto.randomUUID(), user_id: userId, companion_type: companionType, role: 'user', content: message, created_at: now },
        {
          id: crypto.randomUUID(), user_id: userId, companion_type: companionType, role: 'assistant',
          content: responseText, actions_json: actions.length ? actions : null,
          model_used: modelId, tokens_in: tokensIn, tokens_out: tokensOut, created_at: now,
        },
      ]),
      // Atomic, additive increment (supabase/migrations/024_api_usage_increment.sql)
      // — a plain upsert here used to OVERWRITE tokens_in/tokens_out with just
      // this one message's tokens instead of accumulating the day's running
      // total, breaking api_usage's stated cost-visibility purpose (audit
      // 2026-07-06). The message_count cap CHECK above still reads before
      // this increment runs, so a burst of concurrent requests from the same
      // user could still slip a few past FREE_DAILY_CAP — that narrower,
      // cost-bounded race isn't closed by this fix; the accounting
      // correctness bug is.
      admin.rpc('increment_api_usage', {
        p_user_id: userId,
        p_date: day,
        p_message_count: 1,
        p_tokens_in: tokensIn ?? 0,
        p_tokens_out: tokensOut ?? 0,
      }),
    ]);

    return new Response(JSON.stringify({ response: responseText, actions }), { status: 200, headers: cors });
  } catch (err) {
    console.error('ai-chat error:', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: cors });
  }
});
