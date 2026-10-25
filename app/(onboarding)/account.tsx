// Screen 10/10 — account. The account wall, deliberately last (task 062
// acceptance criterion) — everything up to here worked without a login, and
// with every answer collected there's nothing left to wait for once a
// session exists. Email, password and the password again; the confirmation
// email points at the hosted auth page (lib/auth-links.ts).
// If Supabase returns a session straight away (confirmations off) we flush
// the answers and go to the tabs. Otherwise check-email waits for the
// confirmation and signs in; the root layout flushes the answers on that
// first session.
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { AuthField, PasswordRules } from '@/components/AuthField';
import { supabase } from '@/lib/supabase';
import { flushOnboardingIfNeeded, skipOnboarding } from '@/lib/onboarding-data';
import { AUTH_PAGE, authErrorText, holdCredentials, looksLikeEmail, MIN_PASSWORD, passwordProblem } from '@/lib/auth-links';
import { C, F } from '@/lib/theme';
import { hit } from '@/lib/hit';

export default function Account() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const addr = email.trim().toLowerCase();
  const strong = passwordProblem(password) === null;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function createAccount() {
    setError(null);
    if (!looksLikeEmail(addr)) return setError('Enter a valid email address.');
    const problem = passwordProblem(password, confirm);
    if (problem) return setError(problem);

    setLoading(true);
    const { data, error: e } = await supabase.auth.signUp({ email: addr, password, options: { emailRedirectTo: AUTH_PAGE } });
    if (e) { setLoading(false); return setError(authErrorText(e.message)); }
    if (data.user && data.user.identities?.length === 0) { setLoading(false); return setError(authErrorText('already registered')); }
    if (data.session) {
      await flushOnboardingIfNeeded();
      setLoading(false);
      return router.replace('/(tabs)');
    }
    setLoading(false);
    holdCredentials(addr, password);
    router.replace({ pathname: '/(auth)/check-email', params: { email: addr, kind: 'signup' } });
  }

  return (
    <OnboardingShell
      step={10}
      title="Create your account"
      subtitle="Last step. Your answers are saved to it once you confirm your email."
      onNext={createAccount}
      nextLabel={loading ? 'CREATING…' : 'CREATE ACCOUNT'}
      nextDisabled={loading}
      footerNote={
        <Pressable
          hitSlop={hit(240, 15, 8)}
          style={{ alignSelf: 'center', marginBottom: 10 }}
          onPress={async () => { await skipOnboarding(); router.replace('/(auth)/login'); }}
        >
          <Text style={st.fine}>Already have an account? <Text style={{ color: C.ink }}>Sign in</Text></Text>
        </Pressable>
      }
    >
      <AuthField
        label="EMAIL" placeholder="you@example.com" value={email} onChangeText={setEmail}
        keyboardType="email-address" textContentType="emailAddress" autoComplete="email"
        returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()}
      />
      <AuthField
        ref={passRef} label="PASSWORD" secret value={password} onChangeText={setPassword}
        placeholder={`${MIN_PASSWORD}+ characters, with a number`} textContentType="newPassword" autoComplete="new-password"
        ok={strong} returnKeyType="next" onSubmitEditing={() => confirmRef.current?.focus()}
      />
      <AuthField
        ref={confirmRef} label="CONFIRM PASSWORD" secret value={confirm} onChangeText={setConfirm}
        placeholder="Type it again" textContentType="newPassword" autoComplete="new-password"
        ok={confirm.length > 0 && !mismatch && strong} problem={mismatch ? "Passwords don't match." : null}
        returnKeyType="go" onSubmitEditing={createAccount}
      />
      <PasswordRules password={password} confirm={confirm} />
      {!!error && <Text style={st.error}>{error}</Text>}
    </OnboardingShell>
  );
}

const st = StyleSheet.create({
  error: { fontFamily: F.mono, fontSize: 12, color: C.alert, lineHeight: 17 },
  fine: { fontFamily: F.mono, fontSize: 12, color: C.dim },
});
