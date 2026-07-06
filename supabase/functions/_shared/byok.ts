// ─────────────────────────────────────────────────────────────────────────
// _shared/byok.ts — shared AES-256-GCM helpers for the BYOK feature (task 020)
// ─────────────────────────────────────────────────────────────────────────
// Extracted from save-api-key/index.ts so ai-chat can decrypt and actually
// USE a saved key instead of only storing it — an audit (2026-07-06) found
// the Settings toggle silently did nothing because ai-chat always used the
// app's own ANTHROPIC_API_KEY regardless of what was saved here.
// ─────────────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

// 32 raw bytes, base64-encoded — generate with e.g. `openssl rand -base64 32`
// and set via `supabase secrets set API_KEY_ENCRYPTION_SECRET=...`. Same
// secret used by save-api-key/index.ts to encrypt; must match.
const ENCRYPTION_SECRET_B64 = Deno.env.get('API_KEY_ENCRYPTION_SECRET')!;

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}
export function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function getAesKey(): Promise<CryptoKey> {
  const raw = b64ToBytes(ENCRYPTION_SECRET_B64);
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptApiKey(plaintext: string): Promise<{ ciphertextB64: string; ivB64: string }> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { ciphertextB64: bytesToB64(new Uint8Array(ciphertext)), ivB64: bytesToB64(iv) };
}

async function decryptApiKey(ciphertextB64: string, ivB64: string): Promise<string> {
  const key = await getAesKey();
  const iv = b64ToBytes(ivB64);
  const ciphertext = b64ToBytes(ciphertextB64);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/**
 * Fetch + decrypt the user's saved Anthropic key, if any. Returns null on
 * any failure (no row, decrypt error, etc.) so callers can fall back to the
 * app's shared key without special-casing errors.
 */
export async function getUserApiKey(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await admin
      .from('user_api_keys')
      .select('ciphertext_b64, iv_b64')
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) return null;
    return await decryptApiKey(data.ciphertext_b64, data.iv_b64);
  } catch (err) {
    console.error('getUserApiKey decrypt error:', err);
    return null;
  }
}
