// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/tts/index.ts — text-to-speech for the Companion HUD
//
// Proxies Groq PlayAI TTS (reuses the GROQ_API_KEY secret transcribe already
// needs — zero new secrets). The device calls this over Wi-Fi with its own
// JWT and streams the WAV straight into its speaker codec.
//
//   POST Authorization: Bearer <user JWT>
//   body: { text: string, voice?: string }
//   → 200 audio/wav (binary body)
//
// JWT auth is required (unlike transcribe): this endpoint is reachable from
// standalone devices in the field, and per-user identity is what the rate
// limiting rides on.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const GROQ_TTS_URL = 'https://api.groq.com/openai/v1/audio/speech';
const MODEL = 'playai-tts';
const DEFAULT_VOICE = 'Fritz-PlayAI';
const MAX_TEXT_CHARS = 800; // answers are short; hard-cap the spend

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not set' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'invalid token' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? '').trim().slice(0, MAX_TEXT_CHARS);
  if (!text) {
    return new Response(JSON.stringify({ error: 'text required' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const voice = typeof body.voice === 'string' && body.voice ? body.voice : DEFAULT_VOICE;

  const resp = await fetch(GROQ_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      voice,
      input: text,
      response_format: 'wav',
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[tts] Groq error:', resp.status, errText);
    return new Response(JSON.stringify({ error: 'tts failed', detail: errText }), {
      status: 502, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Stream the WAV straight through — the ESP32 reads it chunk-by-chunk.
  return new Response(resp.body, {
    status: 200,
    headers: { ...cors, 'Content-Type': 'audio/wav' },
  });
});
