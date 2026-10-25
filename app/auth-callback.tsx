// habittracker://auth-callback#access_token=…&refresh_token=… — where the
// hosted auth page's OPEN PUCK button lands after an email link (see
// lib/auth-links.ts). Turns the tokens into a session; the root layout's
// auth listener then claims the phone's data for this account and flushes
// any onboarding answers. A bad or expired link says so, with a way back.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { parseAuthFragment } from '@/lib/auth-links';
import { C, F } from '@/lib/theme';

export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useURL();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (url === null) return;
    (async () => {
      const f = parseAuthFragment(url);
      if (f.accessToken && f.refreshToken) {
        const { error: e } = await supabase.auth.setSession({ access_token: f.accessToken, refresh_token: f.refreshToken });
        if (!e) return router.replace('/(tabs)');
        return setError(e.message);
      }
      // No tokens: either an error from Supabase, or the app was opened from
      // a link it already used. With a session already here, just carry on.
      const { data } = await supabase.auth.getSession();
      if (data.session) return router.replace('/(tabs)');
      setError(f.error ?? 'This link has already been used or has expired.');
    })();
  }, [url]);

  return (
    <SafeAreaView style={st.wrap}>
      {error ? (
        <>
          <Text style={st.title}>LINK DIDN'T WORK</Text>
          <Text style={st.sub}>{error}</Text>
          <Text style={st.sub}>Sign in with your email and password — if your email isn't confirmed yet, you can resend the link from there.</Text>
          <Pressable style={st.btn} onPress={() => router.replace('/(auth)/login')}>
            <Text style={st.btnText}>GO TO SIGN IN  ›</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={C.hot} />
          <Text style={[st.sub, { textAlign: 'center' }]}>Signing you in…</Text>
        </>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', paddingHorizontal: 28, gap: 14 },
  title: { fontFamily: F.dot, fontSize: 24, color: C.ink, letterSpacing: 2 },
  sub: { fontFamily: F.mono, fontSize: 13, color: C.dim, lineHeight: 19 },
  btn: { backgroundColor: C.hot, borderRadius: 12, borderCurve: 'continuous', paddingVertical: 16, alignItems: 'center', marginTop: 10 },
  btnText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
});
