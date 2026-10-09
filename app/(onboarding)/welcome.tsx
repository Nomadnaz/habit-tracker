// Screen 1/10 — welcome. The only screen with no OnboardingShell chrome
// (no back button makes sense here, and it needs its own "I already have an
// account" shortcut, which the shared footer doesn't have room for).
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { skipOnboarding } from '@/lib/onboarding-data';

import { C, F } from '@/lib/theme';
import { PuckMark } from '@/components/PuckMark';
const ORANGE = C.hot;
const BOLD = F.mono;
const REG = F.mono;

export default function Welcome() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.headerRow}>
          <PuckMark size={44} />
          <Text style={styles.title}>PUCK</Text>
        </View>
        <Text style={styles.tagline}>TRACK. GROW. THRIVE.</Text>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => router.push('/(onboarding)/basics')}>
          <Text style={styles.primaryBtnText}>GET STARTED</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={async () => {
            await skipOnboarding();
            router.replace('/(auth)/login');
          }}
        >
          <Text style={styles.secondaryBtnText}>I ALREADY HAVE AN ACCOUNT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontFamily: F.dot, fontSize: 44, color: C.ink, letterSpacing: 6, marginLeft: 18 },
  tagline: { fontFamily: REG, fontSize: 12, color: C.dim, marginTop: 12, letterSpacing: 1 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
  primaryBtn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { fontFamily: BOLD, fontSize: 13, color: C.onHot },
  secondaryBtn: { paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { fontFamily: REG, fontSize: 12, color: C.dim },
});
