// Screen 1/10 — welcome. The only screen with no OnboardingShell chrome
// (no back button makes sense here, and it needs its own "I already have an
// account" shortcut, which the shared footer doesn't have room for).
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { skipOnboarding } from '@/lib/onboarding-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

export default function Welcome() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <View style={styles.headerRow}>
          <Text style={styles.bracket}>[</Text>
          <Text style={styles.title}>HABIT{'\n'}TREE</Text>
          <Text style={styles.bracket}>]</Text>
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
  safe: { flex: 1, backgroundColor: BG, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  bracket: { fontFamily: BOLD, fontSize: 32, color: ORANGE },
  title: { fontFamily: BOLD, fontSize: 28, color: INK, textAlign: 'center', lineHeight: 32 },
  tagline: { fontFamily: REG, fontSize: 12, color: MUTED, marginTop: 12, letterSpacing: 1 },
  footer: { paddingHorizontal: 24, paddingBottom: 24, gap: 10 },
  primaryBtn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  primaryBtnText: { fontFamily: BOLD, fontSize: 13, color: '#FFFFFF' },
  secondaryBtn: { paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { fontFamily: REG, fontSize: 11, color: MUTED },
});
