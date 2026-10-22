// ─────────────────────────────────────────────────────────────────────────
// Email links (confirm sign-up, reset password) and the password rules.
//
// Supabase's emails used to land on the project's Site URL — a localhost
// address, so tapping "confirm" in Mail opened a blank Safari page saying it
// couldn't connect. Every email now carries AUTH_PAGE as its redirect: a
// small hosted page (gh-pages branch, pages/auth/index.html) that works on
// any device. It says the email is confirmed and offers OPEN PUCK, which
// hands the session to the app as habittracker://auth-callback#<tokens>
// (app/auth-callback.tsx); for a reset link it asks for the new password
// right there. AUTH_PAGE must be in the project's Redirect URLs allow-list
// (Supabase dashboard → Authentication → URL Configuration), or Supabase
// falls back to the Site URL.
// ─────────────────────────────────────────────────────────────────────────

export const AUTH_PAGE = 'https://nomadnaz.github.io/habit-tracker/auth/';

export const MIN_PASSWORD = 8;

/** What's wrong with a new password, or null when it's fine. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return 'Mix letters and at least one number.';
  if (confirm !== undefined && confirm !== password) return "Passwords don't match.";
  return null;
}

export const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export type AuthFragment = {
  accessToken?: string;
  refreshToken?: string;
  type?: string;
  error?: string;
};

/** The tokens (or the error) Supabase put after the # of a redirect URL. */
export function parseAuthFragment(url: string | null | undefined): AuthFragment {
  if (!url) return {};
  const i = url.indexOf('#');
  // Errors can also arrive in the query string (?error=...), so read both.
  const q = url.indexOf('?');
  const parts = [i >= 0 ? url.slice(i + 1) : '', q >= 0 ? url.slice(q + 1, i > q ? i : undefined) : ''];
  const p = new URLSearchParams(parts.filter(Boolean).join('&'));
  const error = p.get('error_description') ?? p.get('error') ?? undefined;
  return {
    accessToken: p.get('access_token') ?? undefined,
    refreshToken: p.get('refresh_token') ?? undefined,
    type: p.get('type') ?? undefined,
    error: error ? error.replace(/\+/g, ' ') : undefined,
  };
}

/** Friendlier words for the Supabase auth errors people actually hit. */
export function authErrorText(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return "That email and password don't match.";
  if (m.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'There’s already an account with that email. Sign in instead.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many emails sent just now. Wait a few minutes and try again.';
  if (m.includes('password should be')) return `Use at least ${MIN_PASSWORD} characters, with letters and a number.`;
  if (m.includes('network')) return 'No connection. Check your internet and try again.';
  return message;
}

// The sign-up form's credentials, held in memory (never stored) so the
// check-your-inbox screen can sign straight in once the email is confirmed.
let pending: { email: string; password: string } | null = null;
export const holdCredentials = (email: string, password: string) => { pending = { email, password }; };
export const heldCredentials = () => pending;
export const dropCredentials = () => { pending = null; };
