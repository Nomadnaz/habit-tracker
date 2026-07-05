// ─────────────────────────────────────────────────────────────────────────
// OnboardingShell — shared chrome for the 10 onboarding screens (task 062):
// progress dots, title/subtitle, back button, and a primary CTA. Sharing
// this avoids repeating the same header/footer boilerplate 10 times.
// ─────────────────────────────────────────────────────────────────────────

import { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const FAINT  = '#E5E1DA';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

export const TOTAL_ONBOARDING_STEPS = 10;

export default function OnboardingShell({
  step, title, subtitle, children, onNext, nextLabel = 'CONTINUE', nextDisabled = false,
  showBack = true, footerNote,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  footerNote?: ReactNode;
}) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {showBack && step > 1 ? (
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <MaterialCommunityIcons name="chevron-left" size={24} color={INK} />
          </TouchableOpacity>
        ) : <View style={{ width: 24 }} />}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_ONBOARDING_STEPS }, (_, i) => (
            <View key={i} style={[styles.dot, i + 1 <= step && styles.dotActive]} />
          ))}
        </View>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        <View style={styles.body}>{children}</View>
      </ScrollView>

      <View style={styles.footer}>
        {footerNote}
        <TouchableOpacity
          style={[styles.nextBtn, nextDisabled && styles.nextBtnDisabled]}
          onPress={onNext}
          disabled={nextDisabled}
        >
          <Text style={styles.nextBtnText}>{nextLabel}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8,
  },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: FAINT },
  dotActive: { backgroundColor: ORANGE },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16 },
  title: { fontFamily: BOLD, fontSize: 20, color: INK },
  subtitle: { fontFamily: REG, fontSize: 13, color: MUTED, marginTop: 8, lineHeight: 19 },
  body: { marginTop: 24, gap: 12 },
  footer: { paddingHorizontal: 24, paddingBottom: 16, gap: 10 },
  nextBtn: { backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnText: { fontFamily: BOLD, fontSize: 13, color: '#FFFFFF' },
});
