// Sign in · create account · forgot password — one card that changes its
// boxes with the mode. Create account asks for the password twice; forgot
// password asks only for the email and sends a reset link. Every email
// Supabase sends points at the hosted auth page (lib/auth-links.ts), and
// after sending one we go to check-email, which can resend it.
// A successful sign-in needs no redirect here: app/_layout.tsx sees the
// session and moves to the tabs.

import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AUTH_PAGE, authErrorText, holdCredentials, looksLikeEmail, MIN_PASSWORD, passwordProblem } from '@/lib/auth-links';
import { AuthField, PasswordRules } from '@/components/AuthField';
import { PuckMark } from '@/components/PuckMark';
import { C, F } from '@/lib/theme';

type Mode = 'signin' | 'signup' | 'forgot';

const COPY: Record<Mode, { label: string; cta: string }> = {
  signin: { label: 'SIGN IN', cta: 'SIGN IN  ›' },
  signup: { label: 'CREATE ACCOUNT', cta: 'CREATE ACCOUNT  ›' },
  forgot: { label: 'RESET PASSWORD', cta: 'SEND RESET LINK  ›' },
};

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; mode?: Mode }>();
  const [mode, setMode] = useState<Mode>(params.mode ?? 'signin');
  const [email, setEmail] = useState(params.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const passRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const switchTo = (m: Mode) => { setMode(m); setError(null); setUnconfirmed(false); setPassword(''); setConfirm(''); };
  const addr = email.trim().toLowerCase();

  const strong = passwordProblem(password) === null;
  const mismatch = mode === 'signup' && confirm.length > 0 && confirm !== password;

  async function submit() {
    setError(null);
    setUnconfirmed(false);
    if (!looksLikeEmail(addr)) return setError('Enter a valid email address.');

    if (mode === 'forgot') {
      setLoading(true);
      const { error: e } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: AUTH_PAGE });
      setLoading(false);
      if (e) return setError(authErrorText(e.message));
      return router.push({ pathname: '/(auth)/check-email', params: { email: addr, kind: 'reset' } });
    }

    if (!password) return setError('Enter your password.');

    if (mode === 'signup') {
      const problem = passwordProblem(password, confirm);
      if (problem) return setError(problem);
      setLoading(true);
      const { data, error: e } = await supabase.auth.signUp({ email: addr, password, options: { emailRedirectTo: AUTH_PAGE } });
      setLoading(false);
      if (e) return setError(authErrorText(e.message));
      // An existing, confirmed email comes back with no identities (Supabase hides
      // whether an account exists); say so rather than wait for an email that won't come.
      if (data.user && data.user.identities?.length === 0) return setError(authErrorText('already registered'));
      if (data.session) return; // confirmations off — the root layout takes it from here
      holdCredentials(addr, password);
      return router.push({ pathname: '/(auth)/check-email', params: { email: addr, kind: 'signup' } });
    }

    setLoading(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: addr, password });
    setLoading(false);
    if (e) {
      setError(authErrorText(e.message));
      if (e.message.toLowerCase().includes('not confirmed')) setUnconfirmed(true);
    }
  }

  async function resendConfirm() {
    setLoading(true);
    const { error: e } = await supabase.auth.resend({ type: 'signup', email: addr, options: { emailRedirectTo: AUTH_PAGE } });
    setLoading(false);
    if (e) return setError(authErrorText(e.message));
    holdCredentials(addr, password);
    router.push({ pathname: '/(auth)/check-email', params: { email: addr, kind: 'signup' } });
  }

  return (
    <KeyboardAvoidingView style={st.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={st.inner} keyboardShouldPersistTaps="handled">
        <View style={st.headerRow}>
          <PuckMark size={44} />
          <Text style={st.title}>PUCK</Text>
        </View>
        <Text style={st.tagline}>TRACK. GROW. THRIVE.</Text>

        {/* Sign in / Create account tabs; forgot password replaces them with a back link. */}
        {mode === 'forgot' ? (
          <Pressable onPress={() => switchTo('signin')} hitSlop={8} style={{ marginBottom: 14 }}>
            <Text style={st.back}>‹ BACK TO SIGN IN</Text>
          </Pressable>
        ) : (
          <View style={st.tabs}>
            {(['signin', 'signup'] as const).map(m => (
              <Pressable key={m} onPress={() => switchTo(m)} style={[st.tab, mode === m && st.tabOn]}>
                <Text style={[st.tabText, mode === m && st.tabTextOn]}>{m === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={st.card}>
          <Text style={st.cardLabel}>{COPY[mode].label}</Text>
          {mode === 'forgot' && <Text style={st.note}>Enter your account's email and we'll send a link to set a new password.</Text>}

          <AuthField
            label="EMAIL" placeholder="you@example.com" value={email} onChangeText={setEmail}
            keyboardType="email-address" textContentType="emailAddress" autoComplete="email"
            returnKeyType={mode === 'forgot' ? 'send' : 'next'}
            onSubmitEditing={() => (mode === 'forgot' ? submit() : passRef.current?.focus())}
          />

          {mode !== 'forgot' && (
            <AuthField
              ref={passRef} label="PASSWORD" secret value={password} onChangeText={setPassword}
              placeholder={mode === 'signup' ? `${MIN_PASSWORD}+ characters, with a number` : 'Your password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              ok={mode === 'signup' && strong}
              returnKeyType={mode === 'signup' ? 'next' : 'go'}
              onSubmitEditing={() => (mode === 'signup' ? confirmRef.current?.focus() : submit())}
            />
          )}

          {mode === 'signup' && (
            <>
              <AuthField
                ref={confirmRef} label="CONFIRM PASSWORD" secret value={confirm} onChangeText={setConfirm}
                placeholder="Type it again" textContentType="newPassword" autoComplete="new-password"
                ok={confirm.length > 0 && !mismatch && strong} problem={mismatch ? "Passwords don't match." : null}
                returnKeyType="go" onSubmitEditing={submit}
              />
              <PasswordRules password={password} confirm={confirm} />
            </>
          )}

          {mode === 'signin' && (
            <Pressable onPress={() => switchTo('forgot')} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
              <Text style={st.link}>FORGOT PASSWORD?</Text>
            </Pressable>
          )}

          {!!error && <Text style={st.error}>{error}</Text>}
          {unconfirmed && (
            <Pressable onPress={resendConfirm} hitSlop={8}>
              <Text style={st.link}>RESEND CONFIRMATION EMAIL ›</Text>
            </Pressable>
          )}

          <Pressable style={({ pressed }) => [st.button, pressed && { opacity: 0.85 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={C.onHot} /> : <Text style={st.buttonText}>{COPY[mode].cta}</Text>}
          </Pressable>
        </View>

        {mode === 'signup' && <Text style={st.fine}>We'll email you a link to confirm it's you.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 48, justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: F.dot, fontSize: 44, color: C.ink, letterSpacing: 6, marginLeft: 18 },
  tagline: { fontFamily: F.mono, fontSize: 11, color: C.dim, letterSpacing: 2, marginBottom: 32 },

  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14, padding: 4, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, borderCurve: 'continuous', alignItems: 'center' },
  tabOn: { backgroundColor: C.hot },
  tabText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.6 },
  tabTextOn: { color: C.onHot },
  back: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.6 },

  card: { backgroundColor: C.surface, borderRadius: 16, borderCurve: 'continuous', padding: 20, borderWidth: 1, borderColor: C.line, gap: 14 },
  cardLabel: { fontFamily: F.dot, fontSize: 12, color: C.hot, letterSpacing: 2 },
  note: { fontFamily: F.mono, fontSize: 12, color: C.dim, lineHeight: 17 },
  link: { fontFamily: F.dot, fontSize: 9, color: C.ink, letterSpacing: 1.6 },
  error: { fontFamily: F.mono, fontSize: 12, color: C.alert, lineHeight: 17 },
  button: { backgroundColor: C.hot, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  buttonText: { fontFamily: F.dot, color: C.onHot, fontSize: 12, letterSpacing: 2 },
  fine: { fontFamily: F.mono, fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 14 },
});
