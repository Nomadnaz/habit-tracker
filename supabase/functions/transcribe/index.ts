/**
 * transcribe — converts base64 WAV audio to text via Groq Whisper.
 *
 * Groq is fast, has a free tier (14,400 min/day), and is API-compatible with OpenAI.
 * Set GROQ_API_KEY as a Supabase secret:
 *   supabase secrets set GROQ_API_KEY=gsk_...
 *
 * Request:  POST { "audio": "<base64 WAV>", "lang": "en" }
 * Response: { "transcript": "<text>" }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo'; // fast + accurate

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (!GROQ_API_KEY) {
    return new Response(JSON.stringify({ error: 'GROQ_API_KEY not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: { audio: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.audio) {
    return new Response(JSON.stringify({ error: 'audio field required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Decode base64 WAV → binary
  const audioBytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
  const blob = new Blob([audioBytes], { type: 'audio/wav' });

  const form = new FormData();
  form.append('file', blob, 'audio.wav');
  form.append('model', MODEL);
  form.append('language', body.lang ?? 'en');
  form.append('response_format', 'json');

  const resp = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    console.error('[transcribe] Groq error:', resp.status, errText);
    return new Response(JSON.stringify({ error: 'transcription failed', detail: errText }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result: { text: string } = await resp.json();
  return new Response(JSON.stringify({ transcript: (result.text ?? '').trim() }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
