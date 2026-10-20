// device-voice — the puck's phone-free voice path.
//
//   POST  Authorization: Bearer <device user JWT>
//         Content-Type: application/octet-stream
//         ?tz=<JS getTimezoneOffset minutes>&tab=<HUB|LIFT|TASKS|...>&rate=16000
//   body: raw IMA ADPCM, mono, low nibble first (the same stream main/mic.c
//         sends over BLE, minus the per-frame sequence bytes)
//   → 200 { transcript, answer, lift: { name, weightKg } | null }
//
// Until now every spoken request went device → BLE → the phone app → cloud,
// so the puck was useless whenever the app wasn't open and connected. With
// Wi-Fi the device can reach the cloud itself; this function does on the
// server exactly what lib/ble-bridge.ts's _finishSession() does on the phone:
// transcribe → (LIFT tab: lift-setup | "note ...": capture_note |
// otherwise device-log, falling back to ai-chat). The downstream functions are
// called over HTTP with the caller's own JWT, so auth, RLS, rate limits and
// reply formats stay in exactly one place each.
//
// Never answers with an empty string: the device has no other way to learn a
// request failed (see the _callAiChat note in ble-bridge.ts).

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Same tab → companion map as ble-bridge.ts's ask_context handler.
const TAB_TO_COMPANION: Record<string, string> = {
  HUB: 'habitCoach', TIMER: 'focus', TASKS: 'life', GYM: 'gym',
  HABITS: 'habitCoach', RUN: 'activity', BRAIN: 'habitCoach', LIFT: 'gym',
  BODY: 'gym', FUEL: 'calorie',
};

// ── IMA ADPCM (mirrors main/adpcm.c and lib/adpcm.ts exactly) ───────────────
const INDEX_TABLE = [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8];
const STEP_TABLE = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
  15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

export function adpcmToPcm(data: Uint8Array): Int16Array {
  const out = new Int16Array(data.length * 2);
  let predictor = 0, index = 0, o = 0;
  const step1 = (nibble: number) => {
    const step = STEP_TABLE[index];
    let vpdiff = step >> 3;
    if (nibble & 4) vpdiff += step;
    if (nibble & 2) vpdiff += step >> 1;
    if (nibble & 1) vpdiff += step >> 2;
    predictor = nibble & 8 ? predictor - vpdiff : predictor + vpdiff;
    predictor = Math.max(-32768, Math.min(32767, predictor));
    index = Math.max(0, Math.min(88, index + INDEX_TABLE[nibble]));
    out[o++] = predictor;
  };
  for (const b of data) { step1(b & 0x0f); step1((b >> 4) & 0x0f); }
  return out;
}

function wav(pcm: Int16Array, rate: number): Uint8Array<ArrayBuffer> {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); s(8, 'WAVE');
  s(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  s(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, pcm[i], true);
  return new Uint8Array(buf);
}

async function transcribe(audio: Uint8Array<ArrayBuffer>): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', 'whisper-large-v3-turbo'); // same model as the transcribe function
  form.append('language', 'en');
  form.append('response_format', 'json');
  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${GROQ_API_KEY}` }, body: form,
  });
  if (!res.ok) throw new Error(`transcription failed: ${res.status}`);
  return String((await res.json()).text ?? '').trim();
}

/** Calls a sibling Edge Function as the same user. */
async function callFn(name: string, auth: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: { Authorization: auth, apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  return { status: res.status, data };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  const auth = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'unauthorized' }, 401);

  const url = new URL(req.url);
  const tz = Number(url.searchParams.get('tz') ?? '0') || 0;
  const tab = (url.searchParams.get('tab') ?? 'HUB').toUpperCase();
  const rate = Number(url.searchParams.get('rate') ?? '16000') || 16000;

  const adpcm = new Uint8Array(await req.arrayBuffer());
  // < 0.1 s of audio: a mis-press. Say so rather than leaving the puck waiting.
  if (adpcm.length < rate / 20) return json({ transcript: '', answer: "Didn't catch that - hold and speak.", lift: null });

  let transcript = '';
  try {
    if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
    transcript = await transcribe(wav(adpcmToPcm(adpcm), rate));
  } catch (e) {
    console.error('[device-voice]', e);
    return json({ transcript: '', answer: "Couldn't hear that - try again.", lift: null });
  }
  if (!transcript) return json({ transcript: '', answer: "Didn't catch that - try again.", lift: null });

  // LIFT page: "tricep pulldown, twenty kilos" starts a set.
  if (tab === 'LIFT') {
    const { data } = await callFn('lift-setup', auth, { transcript });
    const name = String(data?.name ?? '').trim();
    const weightKg = typeof data?.weightKg === 'number' ? data.weightKg : 0;
    return json({
      transcript,
      answer: name ? `Starting ${name}${weightKg > 0 ? ` at ${weightKg}kg` : ''}` : "Didn't catch the exercise - try again",
      lift: name ? { name: name.toUpperCase(), weightKg } : null,
    });
  }

  // "note ..." goes to the vault, not the AI.
  const spokenNote = /^note[:,]?\s+/i.exec(transcript);
  if (spokenNote) {
    const { status } = await callFn('device-state', auth, {
      actions: [{ op: 'capture_note', text: transcript.slice(spokenNote[0].length) }], tzOffsetMinutes: tz,
    });
    return json({ transcript, answer: status === 200 ? 'Saved to vault.' : 'Could not save the note.', lift: null });
  }

  // Logging first (it executes writes), conversation second.
  const log = await callFn('device-log', auth, { transcript, tzOffsetMinutes: tz });
  const logged = log.status === 200 && log.data?.handled ? String(log.data.speech ?? '').trim() : '';
  if (logged) return json({ transcript, answer: logged, lift: null });

  // The phone bridge kept multi-turn history in memory; here it comes from
  // ai-chat's own persisted turns (last 10 minutes), so a clarifying
  // question the puck just asked can be answered by the next utterance.
  const companionType = TAB_TO_COMPANION[tab] ?? 'habitCoach';
  const { data: recent } = await userClient.from('companion_messages')
    .select('role, content')
    .eq('user_id', user.id).eq('companion_type', companionType)
    .gte('created_at', new Date(Date.now() - 10 * 60_000).toISOString())
    .order('created_at', { ascending: false }).limit(10);
  const conversationHistory = (recent ?? []).reverse();

  const chat = await callFn('ai-chat', auth, {
    message: transcript, companionType, conversationHistory,
    execute: true, source: 'device', tzOffsetMinutes: tz,
  });
  const answer = chat.status === 429 ? "Hit today's AI limit."
    : chat.status !== 200 ? "Couldn't reach the AI - try again."
    : String(chat.data?.response ?? '').trim() || "Didn't get a reply - try again.";
  return json({ transcript, answer, lift: null });
});
