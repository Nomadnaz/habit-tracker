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
          'mood_score', 'date', 'task_hour', 'reps', 'completed',
          'duration_mins', 'distance_m', 'activity_type', 'amount', 'category',
        ],
        properties: {
          kind: {
            type: 'string',
            enum: [
              'meal', 'water', 'weight', 'habit', 'sleep', 'mood', 'task', 'note', 'exercise',
              'gym_checkin', 'focus', 'activity', 'expense', 'medication', 'goal', 'idea',
            ],
          },
          // For kind 'exercise' this is the exercise name as spoken ("squats",
          // "bench press") -- resolved against the user's own `exercises`
          // rows after parsing (see matchExerciseName), not by the model,
          // which never sees the user's exercise IDs. Same idea for
          // 'medication' against the user's `medications`.
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
          // 'habit' only -- defaults to true (marking done) when the speaker
          // doesn't say either way; only set false for an explicit "mark X
          // NOT done" / "undo yoga" style correction.
          completed: nullable({ type: 'boolean' }),
          // Shared by 'gym_checkin', 'focus', 'activity'.
          duration_mins: nullable({ type: 'number' }),
          // 'activity' only.
          distance_m: nullable({ type: 'number' }),
          activity_type: nullable({ type: 'string', enum: ['run', 'hike', 'walk'] }),
          // 'expense' only.
          amount: nullable({ type: 'number' }),
          category: nullable({ type: 'string' }),
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
- "exercise" is the ONE kind that needs two specific numbers to be usable: a named exercise + weight + reps, e.g. "squats, sixty kilos for eight reps" -> name "Squats", weight_kg 60, reps 8. Only emit "exercise" when BOTH a weight and a rep count were said -- "I did squats" alone with no numbers goes to "unclear". This rule is specific to "exercise" and does not apply to any other kind -- "task" and "note" in particular need no numbers or measurements at all. "Add a task to call the dentist" or "remind me to call the dentist" is straightforwardly a task, exactly as confidently as "logged a coffee" is a meal. Do not become more hesitant about task/note/habit/mood just because exercise has a stricter bar.
- "habit": completed defaults to true (marking it done) whenever the speaker doesn't say otherwise -- "yoga done" or just "I did yoga" is completed:true. Only set completed:false for an explicit correction or undo: "actually I didn't do yoga", "mark running as not done", "undo the gym habit".
- "gym_checkin" is a bare "I went to the gym" / "gym done today" with no exercise/weight/reps attached -- if numbers ARE given, that is an "exercise" item instead, not this.
- "focus" needs a duration in minutes: "25 minute focus session", "focused for an hour" -> duration_mins 60. No duration said -> "unclear".
- "activity" needs BOTH activity_type (run/hike/walk) and a duration: "ran for 25 minutes", "hiked for an hour and a half". distance_m only if a distance was actually said ("ran 5k" -> distance_m 5000) -- never estimate distance from duration alone.
- "expense" needs an amount: "spent twelve pounds on lunch" -> amount 12, category "food", name "lunch". No amount said -> "unclear".
- "medication" is "I took my <name>" / "missed my <name>" -- name is the medication as spoken, nothing else needed.
- "goal" is creating a NEW goal, not progress on an existing one: "add a goal to run a marathon" -> name "Run a marathon". A vague aspiration mentioned in passing ("I really should get fitter") is not a goal creation.
- "idea" is an explicit capture: "save this idea: ...", "note an idea about ...". A stray thought not framed as worth saving goes to "unclear", not "idea".`;

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
      return {
        type: 'toggle_habit', confidence: conf,
        data: { name: item.name, date, completed: typeof item.completed === 'boolean' ? item.completed : true },
      };
    case 'sleep':
      return { type: 'log_sleep', confidence: conf, data: { totalHours: n(item.total_hours), date } };
    case 'mood':
      return { type: 'log_mood', confidence: conf, data: { moodScore: n(item.mood_score), date } };
    case 'task':
      return { type: 'create_task', confidence: conf, data: { label: item.name, date, hour: n(item.task_hour) } };
    case 'note':
      return { type: 'remember_about_user', confidence: conf, data: { note: item.name } };
    case 'gym_checkin':
      return { type: 'gym_checkin', confidence: conf, data: { durationMins: n(item.duration_mins), date } };
    case 'focus': {
      const durationMins = n(item.duration_mins);
      if (durationMins === undefined) return null;
      return { type: 'log_focus_session', confidence: conf, data: { durationMins, date } };
    }
    case 'activity': {
      const durationMins = n(item.duration_mins);
      const activityType = typeof item.activity_type === 'string' ? item.activity_type : undefined;
      if (durationMins === undefined || !activityType) return null;
      return {
        type: 'log_activity', confidence: conf,
        data: { type: activityType, durationMins, distanceM: n(item.distance_m) },
      };
    }
    case 'expense': {
      const amount = n(item.amount);
      if (amount === undefined) return null;
      return {
        type: 'log_expense', confidence: conf,
        data: { amount, category: item.category, note: item.name, date },
      };
    }
    case 'medication':
      return { type: 'log_medication', confidence: conf, data: { name: item.name, date } };
    case 'goal':
      return { type: 'create_goal', confidence: conf, data: { title: item.name } };
    case 'idea':
      return { type: 'save_idea', confidence: conf, data: { content: item.name } };
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
    case 'habit': return `${item.name} ${item.completed === false ? '✗' : '✓'}`;
    case 'sleep': return `${item.total_hours} h sleep`;
    case 'mood': return `mood ${r(item.mood_score)}/10`;
    case 'task': return `task: ${item.name}`;
    case 'exercise': return `${item.name} · ${item.weight_kg}kg x${r(item.reps)}`;
    case 'gym_checkin': return 'gym session ✓';
    case 'focus': return `${r(item.duration_mins)} min focus`;
    case 'activity': return `${item.activity_type} · ${r(item.duration_mins)} min`;
    case 'expense': return `${item.name ?? item.category ?? 'expense'} · ${item.amount}`;
    case 'medication': return `${item.name} ✓`;
    case 'goal': return `goal: ${item.name}`;
    case 'idea': return `idea: ${item.name}`;
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
      if (r.status === 'executed') {
        logged.push({ kind: String(actionable[i]?.item.kind ?? ''), summary });
      } else if (r.status === 'failed') {
        // A write was genuinely attempted and errored (bad data, a real
        // DB error) -- report it, never silently drop it.
        failed.push({ summary, reason: r.message ?? r.status });
      }
      // Any other status (preview/clarify/unsupported) means processActions
      // never actually attempted anything -- it's the app's confirm-before-
      // acting gate for confidence below the auto threshold, meant for a
      // screen that can show a confirmation card. The device has no such
      // screen, so a gated (not executed, not failed) action isn't a
      // failure -- it's simply not handled, same as if nothing had parsed
      // at all. (Bug fixed 2026-08-31: this used to lump every non-executed
      // status into `failed`, which meant a moderate-confidence guess like
      // "set tomorrow to a push day" surfaced as "Couldn't log that: Confirm
      // to remember_about_user" -- an internal gate name read out as if it
      // were an error, with `handled: true` blocking the ai-chat fallback
      // that could have answered conversationally instead.)
    });

    // "handled" is the routing signal: only a REAL attempt (something written,
    // or something recognized and attempted but genuinely failed) counts.
    // unclear-only means the model couldn't confidently classify anything --
    // indistinguishable from "this wasn't a log at all" ("what did I eat
    // today?", or a misclassified "add a task"), so the caller must fall
    // through to ai-chat rather than claiming the turn with a non-answer.
    // (Bug fixed 2026-08-31: this used to also count bare `unclear` as
    // handled, which silently swallowed every utterance the classifier
    // wasn't confident about -- including plain task/note requests that
    // ai-chat would have handled correctly -- with no fallback.)
    const handled = logged.length > 0 || failed.length > 0;

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
