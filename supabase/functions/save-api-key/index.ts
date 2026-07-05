// ─────────────────────────────────────────────────────────────────────────
// supabase/functions/save-api-key/index.ts — BYOK toggle (task 020)
//
// Contract:
//   GET   Authorization: Bearer <JWT>              → { hasKey: boolean }
//   POST  Authorization: Bearer <JWT>  { apiKey: string | null }
//         apiKey present+non-empty → encrypt (AES-256-GCM) and save
//         apiKey null/empty        → delete the saved key (revert to app credits)
//         → { hasKey: boolean }
//
// The plaintext key exists only for the duration of this request. It is
// encrypted with a server-only secret (API_KEY_ENCRYPTION_SECRET, a 32-byte
// key, base64) before being written to user_api_keys — never stored or
// logged in plaintext, never sent back to any client. Consuming a saved
// BYOK key inside ai-chat's actual Anthropic call is NOT wired yet (out of
// this task's "minimal" scope per its own title) — this function only
// covers the toggle + encrypted storage half.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// 32 raw bytes, base64-encoded — generate with e.g. `openssl rand -base64 32`
// and set via `supabase secrets set API_KEY_ENCRYPTION_SECRET=...`.
const ENCRYPTION_SECRET_B64 = Deno.env.get('API_KEY_ENCRYPTION_SECRET')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
};

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function getAesKey(): Promise<CryptoKey> {
  const raw = b64ToBytes(ENCRYPTION_SECRET_B64);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encrypt(plaintext: string): Promise<{ ciphertextB64: string; ivB64: string }> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { ciphertextB64: bytesToB64(new Uint8Array(ciphertext)), ivB64: bytesToB64(iv) };
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
      const { data } = await admin.from('user_api_keys').select('user_id').eq('user_id', user.id).maybeSingle();
      return new Response(JSON.stringify({ hasKey: !!data }), { status: 200, headers: cors });
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const apiKey: string | null = typeof body.apiKey === 'string' ? body.apiKey.trim() : null;

      if (!apiKey) {
        await admin.from('user_api_keys').delete().eq('user_id', user.id);
        return new Response(JSON.stringify({ hasKey: false }), { status: 200, headers: cors });
      }

      const { ciphertextB64, ivB64 } = await encrypt(apiKey);
      await admin.from('user_api_keys').upsert({
        user_id: user.id,
        ciphertext_b64: ciphertextB64,
        iv_b64: ivB64,
        updated_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ hasKey: true }), { status: 200, headers: cors });
    }

    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: cors });
  } catch (err) {
    console.error('save-api-key error:', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500, headers: cors });
  }
});
