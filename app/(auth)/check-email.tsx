// After sign-up or "forgot password": what to do with the email we just sent.
// Sign-up: once the link's tapped (on any device) the account's confirmed.
// We sign in with the credentials held from the form when the person taps
// CONTINUE, or by ourselves when they come back to the app from Mail; the
// root layout then moves to the tabs and flushes any onboarding answers.
// Reset: the link opens a page to choose a new password, then sign in here.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { AUTH_PAGE, authErrorText, dropCredentials, heldCredentials } from '@/lib/auth-links';
import { C, F } from '@/lib/theme';

const COOLDOWN = 60;

export default function CheckEmail() {
  const router = useRouter();
  const { email = '', kind = 'signup' } = useLocalSearchParams<{ email?: string; kind?: 'signup' | 'reset' }>();
  const signup = kind === 'signup';
  const [wait, setWait] = useState(COOLDOWN);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  // Sign in with what they typed on the form. Quiet when called on return to the app.
  const tryContinue = useCallback(async (quiet: boolean) => {
    const held = heldCredentials();
    if (!held) {
      if (!quiet) router.replace({ pathname: '/(auth)/login', params: { email } });
      return;
    }
    if (!quiet) setBusy(true);
    const { error } = await supabase.auth.signInWithPassword(held);
    if (!quiet) setBusy(false);
    if (!error) return dropCredentials(); // the root layout routes on the new session
    if (!quiet) {
      setNote({
        text: error.message.toLowerCase().includes('not confirmed')
          ? "Not confirmed yet — tap the button in the email first, then come back."
          : authErrorText(error.message),
        bad: true,
      });
    }
  }, [email]);

  useEffect(() => {
    if (!signup) return;
    const sub = AppState.addEventListener('change', s => { if (s === 'active') tryContinue(true); });
    return () => sub.remove();
  }, [signup, tryContinue]);

  async function resend() {
    setBusy(true);
    const { error } = signup
      ? await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: AUTH_PAGE } })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: AUTH_PAGE });
    setBusy(false);
    if (error) return setNote({ text: authErrorText(error.message), bad: true });
    setWait(COOLDOWN);
    setNote({ text: 'Sent again. It can take a minute — check spam too.' });
  }

  const steps = signup
    ? ['Open the email from PUCK', 'Tap the confirm link', 'Come back here — we sign you in']
    : ['Open the email from PUCK', 'Tap the reset link', 'Choose a new password, then sign in'];

  return (
    <SafeAreaView style={st.safe} edges={['top', 'bottom']}>
      <View style={st.body}>
        <Envelope />
        <Text style={st.title}>{signup ? 'CONFIRM YOUR EMAIL' : 'CHECK YOUR INBOX'}</Text>
        <Text style={st.sub}>We sent a link to</Text>
        <Text style={st.email}>{email}</Text>

        <View style={st.steps}>
          {steps.map((s, i) => (
            <View key={s} style={st.step}>
              <Text style={st.stepNum}>{String(i + 1).padStart(2, '0')}</Text>
              <Text style={st.stepText}>{s}</Text>
            </View>
          ))}
        </View>

        {note && <Text style={[st.note, note.bad && { color: C.alert }]}>{note.text}</Text>}
      </View>

      <View style={st.footer}>
        {signup ? (
          <Pressable style={st.primary} onPress={() => tryContinue(false)} disabled={busy}>
            {busy ? <ActivityIndicator color={C.onHot} /> : <Text style={st.primaryText}>I'VE CONFIRMED  ›</Text>}
          </Pressable>
        ) : (
          <Pressable style={st.primary} onPress={() => router.replace({ pathname: '/(auth)/login', params: { email } })}>
            <Text style={st.primaryText}>BACK TO SIGN IN  ›</Text>
          </Pressable>
        )}
        <View style={st.row}>
          <Pressable onPress={resend} disabled={busy || wait > 0} hitSlop={8} style={st.ghost}>
            <Text style={[st.ghostText, (busy || wait > 0) && { color: C.faint }]}>{wait > 0 ? `RESEND IN ${wait}S` : 'RESEND EMAIL'}</Text>
          </Pressable>
          {Platform.OS === 'ios' && (
            <Pressable onPress={() => Linking.openURL('message://').catch(() => {})} hitSlop={8} style={st.ghost}>
              <Text style={st.ghostText}>OPEN MAIL</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => { dropCredentials(); router.replace({ pathname: '/(auth)/login', params: { mode: signup ? 'signup' : 'forgot' } }); }}
          hitSlop={8}
        >
          <Text style={st.fine}>Wrong email? Start again</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

// A pixel envelope in the puck's dots.
const ENVELOPE = [
  '###########',
  '##.......##',
  '#.#.....#.#',
  '#..#...#..#',
  '#...#.#...#',
  '#....#....#',
  '#.........#',
  '###########',
];
function Envelope() {
  return (
    <View style={{ gap: 2, marginBottom: 28 }}>
      {ENVELOPE.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 2 }}>
          {r.split('').map((ch, j) => <View key={j} style={{ width: 6, height: 6, backgroundColor: ch === '#' ? C.hot : C.ghost }} />)}
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  body: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  title: { fontFamily: F.dot, fontSize: 26, color: C.ink, letterSpacing: 2 },
  sub: { fontFamily: F.mono, fontSize: 13, color: C.dim, marginTop: 14 },
  email: { fontFamily: F.mono, fontSize: 15, color: C.hot, marginTop: 4 },
  steps: { marginTop: 28, gap: 12 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: { fontFamily: F.dot, fontSize: 11, color: C.live, letterSpacing: 1 },
  stepText: { fontFamily: F.mono, fontSize: 13, color: C.ink },
  note: { fontFamily: F.mono, fontSize: 12, color: C.live, marginTop: 24, lineHeight: 17 },
  footer: { paddingHorizontal: 24, paddingBottom: 20, gap: 14, alignItems: 'stretch' },
  primary: { backgroundColor: C.hot, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 16, alignItems: 'center' },
  primaryText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
  row: { flexDirection: 'row', gap: 10 },
  ghost: { flex: 1, borderWidth: 1, borderColor: C.lineHi, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 13, alignItems: 'center' },
  ghostText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.6 },
  fine: { fontFamily: F.mono, fontSize: 11, color: C.dim, textAlign: 'center' },
});
