// Screen 9/10 — account. The account wall, deliberately this late (task 062
// acceptance criterion) — everything up to here worked without a login.
// If Supabase returns a session immediately (email confirmation disabled on
// this project), we flush onboarding answers now and move on to the last
// screen. If it requires email confirmation, we tell the user to confirm
// and log in — flushOnboardingIfNeeded() picks up the pending answers the
// next time app/_layout.tsx sees a session (any future login).
import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import OnboardingShell from '@/components/OnboardingShell';
import { supabase } from '@/lib/supabase';

const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const REG    = 'PixeloidSans_400Regular';

export default function Account() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function createAccount() {
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter an email and password.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
      return;
    }
    if (data.session) {
      // Email confirmation is off for this project — we're logged in already.
      // Flushing happens at the END of briefing-builder (screen 10), once that
      // screen's answer is folded in too — not here, or briefing_preferences
      // would be written before the user has chosen anything.
      router.push('/(onboarding)/briefing-builder');
    } else {
      // Confirmation required — the answers stay cached locally until the
      // user confirms and logs in; app/_layout.tsx flushes them then.
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Once you confirm, log in and we\'ll pick up right where you left off.',
        [{ text: 'Go to login', onPress: () => router.replace('/(auth)/login') }],
      );
    }
  }

  return (
    <OnboardingShell
      step={9}
      title="Create your account"
      subtitle="One more step and you're in."
      onNext={createAccount}
      nextLabel={loading ? 'CREATING…' : 'CREATE ACCOUNT'}
      nextDisabled={loading}
    >
      <TextInput
        style={styles.input} placeholder="EMAIL" placeholderTextColor={MUTED}
        value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
      />
      <TextInput
        style={styles.input} placeholder="PASSWORD" placeholderTextColor={MUTED}
        value={password} onChangeText={setPassword} secureTextEntry
      />
      {loading && <ActivityIndicator color={INK} />}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 14,
    fontFamily: REG, fontSize: 13, color: INK, backgroundColor: CARD,
  },
});
