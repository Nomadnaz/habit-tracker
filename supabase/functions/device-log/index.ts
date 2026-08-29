// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/device-log/index.ts — one utterance, many writes
//
//   POST  Authorization: Bearer <user JWT>
//   body: { transcript: string, tzOffsetMinutes?: number }
//   → { handled: boolean, logged: [{ kind, summary }],
//       failed: [{ summary, reason }], unclear: string[], speech: string }
//
//   handled=false means the utterance wasn't a log ("what did I eat today?").
//   The caller should route it to ai-chat instead. Nothing is billed in that
//   case, so a question costs one model call, not two.
//
// WHY THIS IS NOT ai-chat:
//   ai-chat is built to converse. It returns prose, emits at most one action
//   per turn, and GATES rather than executes — correct for the app, which has
//   a local store to confirm into and a screen to show a preview on. The
//   device has neither. "Bought a meal deal — egg and cress, coffee, protein
//   bar" is three `meals` rows that must be written before the user has put
//   the device back in their pocket. So this endpoint parses many actions from
//   one sentence, executes them server-side, and reports what actually landed.
//
// Structured outputs, not <action> tags: ai-chat regex-scrapes `<action>` JSON
// out of prose, which silently drops a malformed block. Here the schema is
// enforced at the API layer, so a mismatch is retried by the model rather than
// becoming a log the user thinks happened and didn't.
//
// Model: Haiku 4.5, per system-model.md's canonical model policy (cost is
// load-bearing for the free tier, and this is short structured extraction —
// the task Haiku is best at). Latency matters as much as cost: this sits in a
// press-speak-release loop the user is standing still for.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { processActions, type CompanionAction } from '../_shared/actionExecutor.ts';
import { getUserApiKey } from '../_shared/byok.ts';
import { localDateKey } from '../_shared/localDate.ts';
import { matchExerciseName } from '../_shared/exercises.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const MODEL = 'claude-haiku-4-5';
const FREE_DAILY_CAP = Number(Deno.env.get('FREE_DAILY_CAP') ?? '25');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });

// One flat item shape rather than a discriminated union per action type.
// Structured outputs require `required` to list every property and
// `additionalProperties: false`, so a union would mean repeating the whole
// object per variant; a flat row with nulls costs a few tokens and keeps the
// schema readable. `kind` is the discriminator the executor switches on.
const LOG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'unclear'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'kind', 'name', 'confidence', 'calories', 'protein_g', 'carbs_g',
          'fat_g', 'meal_type', 'amount_ml', 'weight_kg', 'total_hours',
          'mood_score', 'date', 'task_hour', 'reps',
        ],
        properties: {
          kind: {
            type: 'string',
            enum: ['meal', 'water', 'weight', 'habit', 'sleep', 'mood', 'task', 'note', 'exercise'],
          },
          // For kind 'exercise' this is the exercise name as spoken ("squats",
          // "bench press") -- resolved against the user's own `exercises`
          // rows after parsing (see matchExerciseName), not by the model,
          // which never sees the user's exercise IDs.
          name: { type: 'string' },
          confidence: { type: 'number' },
          // Nullable fields use anyOf rather than a `type: ['number','null']`
          // array: anyOf is documented as supported by structured outputs,
          // type-arrays are not, and a schema the API rejects fails EVERY
          // request rather than degrading.
          calories: nullable({ type: 'number' }),
          protein_g: nullable({ type: 'number' }),
          carbs_g: nullable({ type: 'number' }),
          fat_g: nullable({ type: 'number' }),
          meal_type: nullable({ type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack'] }),
          amount_ml: nullable({ type: 'number' }),
          weight_kg: nullable({ type: 'number' }),
          total_hours: nullable({ type: 'number' }),
          mood_score: nullable({ type: 'number' }),
          date: nullable({ type: 'string' }),
          task_hour: nullable({ type: 'number' }),
          reps: nullable({ type: 'number' }),
        },
      },
    },
    // Anything the model heard but could not turn into a write. Surfaced to
    // the user rather than dropped -- a silently ignored half-sentence is how
    // a logger loses someone's trust.
    unclear: { type: 'array', items: { type: 'string' } },
  },
} as const;

const SYSTEM_PROMPT = `You turn one spoken sentence into structured log entries for a personal health tracker.

The speaker is standing in a shop, a gym, or a kitchen. They talk in one breath and expect everything they mentioned to be recorded. Your job is to catch ALL of it.

RULES
- One utterance often contains SEVERAL items. "Meal deal - egg and cress sandwich, coffee, and a protein bar" is THREE separate meal items, not one.
- Estimate macros for every food from the name alone. There is no photo. A rough, honest estimate beats refusing: use typical UK supermarket portions. An egg and cress sandwich is ~330 kcal / 14g protein. A flat white is ~120 kcal. A protein bar is ~200 kcal / 20g protein.
- Convert spoken quantities to the field's unit: "half a litre" -> amount_ml 500. "two pints" -> 1136. "twelve and a half stone" -> weight_kg 79.4.
- meal_type: infer from the food and the hour if the speaker doesn't say. A sandwich at midday is lunch; a protein bar on its own is a snack.
- confidence 0-1: how sure you are this is what they meant. Below 0.5, put the phrase in "unclear" instead of guessing.
- Anything you cannot confidently turn into an entry goes in "unclear" verbatim. Never invent a number the speaker did not say and you cannot reasonably estimate.
- Never log something the speaker only mentioned in passing ("I should drink more water" is not a water log).
- "exercise" is a gym set: a named exercise + weight + reps, e.g. "squats, sixty kilos for eight reps" -> name "Squats", weight_kg 60, reps 8. Only emit this when BOTH a weight and a rep count were said -- "I did squats" alone with no numbers goes to "unclear", never guessed.`;

// Maps one parsed item onto the executor contract in _shared/actionExecutor.ts.
// exerciseId is pre-resolved (async, needs a DB lookup) and passed in only
// for kind 'exercise' -- every other kind ignores the third argument.
function toAction(item: Record<string, unknown>, exerciseId?: string | null): CompanionAction | null {
  const conf = typeof item.confidence === 'number' ? item.confidence : 0.5;
  const n = (v: unknown) => (typeof v === 'number' ? v : undefined);
  const date = typeof item.date === 'string' ? item.date : 'today';

  switch (item.kind) {
    case 'exercise': {
      const weightKg = n(item.weight_kg);
      const reps = n(item.reps);
      if (!exerciseId || weightKg === undefined || reps === undefined) return null;
      return { type: 'log_set', confidence: conf, data: { exerciseId, weightKg, reps, date } };
    }
    case 'meal':
      return {
        type: 'log_meal', confidence: conf,
        data: {
          name: item.name, date,
          calories: n(item.calories) ?? 0,
          proteinG: n(item.protein_g) ?? 0,
          carbsG: n(item.carbs_g) ?? 0,
          fatG: n(item.fat_g) ?? 0,
          mealType: item.meal_type ?? 'snack',
        },
      };
    case 'water':
      return { type: 'log_water', confidence: conf, data: { amountMl: n(item.amount_ml) } };
    case 'weight':
      return { type: 'log_weight', confidence: conf, data: { weightKg: n(item.weight_kg) } };
    case 'habit':
      return { type: 'toggle_habit', confidence: conf, data: { name: item.name, date } };
    case 'sleep':
      return { type: 'log_sleep', confidence: conf, data: { totalHours: n(item.total_hours), date } };
    case 'mood':
      return { type: 'log_mood', confidence: conf, data: { moodScore: n(item.mood_score), date } };
    case 'task':
      return { type: 'create_task', confidence: conf, data: { label: item.name, date, hour: n(item.task_hour) } };
    case 'note':
      return { type: 'remember_about_user', confidence: conf, data: { note: item.name } };
    default:
      return null;
  }
}

// What the device shows/says back. Deliberately terse -- this is read at a
// glance, mid-shop, or heard over gym noise.
function summarise(item: Record<string, unknown>): string {
  const r = (v: unknown) => Math.round(typeof v === 'number' ? v : 0);
  switch (item.kind) {
    case 'meal': return `${item.name} · ${r(item.calories)} kcal`;
    case 'water': return `${r(item.amount_ml)} ml water`;
    case 'weight': return `${item.weight_kg} kg`;
    case 'habit': return `${item.name} ✓`;
    case 'sleep': return `${item.total_hours} h sleep`;
    case 'mood': return `mood ${r(item.mood_score)}/10`;
    case 'task': return `task: ${item.name}`;
    case 'exercise': return `${item.name} · ${item.weight_kg}kg x${r(item.reps)}`;
    default: return String(item.name ?? item.kind);
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
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    const tz = typeof body.tzOffsetMinutes === 'number' ? body.tzOffsetMinutes : 0;
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'transcript required' }), { status: 400, headers: cors });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const today = localDateKey(tz);

    // Same daily ceiling as ai-chat, counted in the same table -- a device log
    // is a model call and must not be a way around the cap.
    const byok = await getUserApiKey(admin, userId);
    if (!byok) {
      const { data: usage } = await admin
        .from('api_usage').select('message_count')
        .eq('user_id', userId).eq('date', today).maybeSingle();
      if ((usage?.message_count ?? 0) >= FREE_DAILY_CAP) {
        return new Response(
          JSON.stringify({ error: 'daily limit reached', speech: "You've hit today's logging limit." }),
          { status: 429, headers: cors },
        );
      }
    }

    const anthropic = new Anthropic({ apiKey: byok ?? ANTHROPIC_API_KEY });
    const parsed = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 2048,
      system: [{
        type: 'text',
        text: `${SYSTEM_PROMPT}\n\nToday is ${today}.`,
        // The prompt is identical every call and dwarfs the utterance, so the
        // cached prefix is most of each request. system-model.md makes caching
        // mandatory: without it the free tier loses money.
        cache_control: { type: 'ephemeral' },
      }],
      output_config: { format: { type: 'json_schema', schema: LOG_SCHEMA } },
      messages: [{ role: 'user', content: transcript }],
    });

    const out = parsed.parsed_output as { items?: Record<string, unknown>[]; unclear?: string[] } | null;
    const items = out?.items ?? [];
    const unclear = out?.unclear ?? [];

    // Exercise names need resolving against this user's own `exercises`
    // rows before an action can be built -- fetch once, reuse for every
    // 'exercise' item in the utterance rather than a query each.
    const hasExercise = items.some((it) => it.kind === 'exercise');
    const userExercises = hasExercise
      ? ((await admin.from('exercises').select('id, name').eq('user_id', userId)).data ?? [])
      : [];

    // Build item/action pairs together so a null action (unresolved exercise
    // name, missing weight/reps) can be dropped WITHOUT desyncing `items[i]`
    // from `results[i]` below -- a plain map+filter would silently misalign
    // every item after the first drop.
    const pairs = items.map((item) => {
      const exerciseId = item.kind === 'exercise'
        ? matchExerciseName(String(item.name ?? ''), userExercises)
        : undefined;
      return { item, action: toAction(item, exerciseId) };
    });
    const actionable = pairs.filter((p): p is { item: Record<string, unknown>; action: CompanionAction } => p.action !== null);
    // Items that parsed but couldn't become an action (e.g. "leg press" with
    // no matching exercise, or an ambiguous name) go into unclear too --
    // never silently dropped, same rule as the model's own "unclear" list.
    for (const p of pairs) {
      if (p.action === null && p.item.kind === 'exercise') {
        unclear.push(`${String(p.item.name ?? 'exercise')} — no matching exercise found, or missing weight/reps`);
      }
    }

    // execute:true is the whole point -- the device has no local store to
    // confirm a gated action into, so the write happens here or nowhere.
    const results = await processActions(admin, userId, actionable.map((p) => p.action), { execute: true, tzOffsetMinutes: tz });

    const logged: { kind: string; summary: string }[] = [];
    const failed: { summary: string; reason: string }[] = [];
    results.forEach((r, i) => {
      const summary = summarise(actionable[i]?.item ?? {});
      if (r.status === 'executed') logged.push({ kind: String(actionable[i]?.item.kind ?? ''), summary });
      // Anything not executed is reported, never silently dropped: a log the
      // user believes happened and didn't is worse than an audible failure.
      else failed.push({ summary, reason: r.message ?? r.status });
    });

    // "handled" is the routing signal: nothing parsed means this wasn't a log
    // at all ("what did I eat today?"), and the caller should fall through to
    // ai-chat rather than answering with silence.
    const handled = logged.length > 0 || failed.length > 0 || unclear.length > 0;

    // Only bill an utterance that actually did logging work. An unhandled one
    // goes on to ai-chat, which bills its own call — without this guard a
    // single question would cost the user two against FREE_DAILY_CAP.
    if (handled) {
      await admin.from('api_usage').upsert({
        user_id: userId, date: today,
        message_count: 1, last_message_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date', ignoreDuplicates: false });
    }

    const speech = logged.length === 0
      ? (failed.length ? `Couldn't log that: ${failed[0].reason}` : "Didn't catch anything to log.")
      : `Logged ${logged.map((l) => l.summary).join(', ')}` +
        (failed.length ? `. ${failed.length} didn't save.` : '');

    return new Response(JSON.stringify({ handled, logged, failed, unclear, speech }), { headers: cors });
  } catch (err) {
    console.error('device-log error', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }),
      { status: 500, headers: cors },
    );
  }
});
