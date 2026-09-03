// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/lift-setup/index.ts — voice → lift_begin() parameters
//
//   POST  Authorization: Bearer <user JWT>
//   body: { transcript: string }
//   → { name: string | null, weightKg: number | null }
//
// The LIFT screen has always claimed "SPEAK THE EXERCISE AND WEIGHT"
// (companion-hud/main/screen_lift.c) but until now the only way to start a
// set was the TEST SET calibration button — this is what makes the claim
// true. A hold-to-talk press made while on the LIFT tab routes here instead
// of device-log/ai-chat (see lib/ble-bridge.ts's liftSetupMode), gets
// parsed, and the caller sends the result back to the device as a
// BLE_CMD_LIFT_BEGIN command (companion-hud/main/ble_svc.h) rather than
// speaking a prose answer.
//
// Deliberately its own tiny function rather than a device-log "mode": no DB
// write happens here at all (lift.c measures the set; the actual
// exercise_sets write happens later, on LIFT_DONE, via device-state's
// log_set — see screen_lift.c), so none of device-log's items/kind/
// unclear/billing machinery applies. A single {name, weightKg} extraction
// doesn't need it.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { getUserApiKey } from '../_shared/byok.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const MODEL = 'claude-haiku-4-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'weightKg'],
  properties: {
    // Null if the speaker didn't name an exercise at all -- never invented.
    name: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    // Null if no weight was said. lift_begin() accepts weight 0 (the set
    // still measures, it just uploads without a load) -- 0 and "not said"
    // are different things, so this stays nullable rather than defaulting.
    weightKg: { anyOf: [{ type: 'number' }, { type: 'null' }] },
  },
} as const;

const SYSTEM_PROMPT = `The speaker is about to start a gym set and just said the exercise name, optionally followed by the weight. Extract exactly two things.

RULES
- name: the exercise as spoken, Title Case, e.g. "tricep pulldown" -> "Tricep Pulldown". If genuinely no exercise name is present, name is null.
- weightKg: convert to kilograms. "twenty kilos" -> 20. "forty five pounds" -> 20.4. "bodyweight" or no weight mentioned -> null (not 0 -- 0 would mean "they said zero kilos", which is different from "they didn't say a weight").
- This is a SHORT setup phrase, not a sentence to interpret loosely -- "tricep pulldown twenty kilos" is the whole input, not a fragment of something longer. Take the first plausible exercise name and weight; don't overthink filler words.`;

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

    const body = await req.json().catch(() => ({}));
    const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : '';
    if (!transcript) {
      return new Response(JSON.stringify({ error: 'transcript required' }), { status: 400, headers: cors });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const byok = await getUserApiKey(admin, user.id);
    const anthropic = new Anthropic({ apiKey: byok ?? ANTHROPIC_API_KEY });

    const parsed = await anthropic.messages.parse({
      model: MODEL,
      max_tokens: 256,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: transcript }],
    });

    const out = parsed.parsed_output as { name: string | null; weightKg: number | null } | null;
    return new Response(
      JSON.stringify({ name: out?.name ?? null, weightKg: out?.weightKg ?? null }),
      { headers: cors },
    );
  } catch (err) {
    console.error('lift-setup error', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown error' }),
      { status: 500, headers: cors },
    );
  }
});
