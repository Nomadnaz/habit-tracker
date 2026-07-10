// ─────────────────────────────────────────────────────────────────────────
// LIFE — card-grid hub (Code Audit v2 fix plan, P1). Pure navigation: each
// card routes to an existing screen, no new logic. Owns goals, finance,
// library, focus timer, calendar. Gives the `life` AI companion (configured
// but previously unreachable — Code Audit v2 §1.5) a real entry point.
// ─────────────────────────────────────────────────────────────────────────

import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

const CARDS: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; route: string }[] = [
  { label: 'GOALS',       icon: 'flag-checkered', route: '/modals/goals' },
  { label: 'FINANCE',     icon: 'cash-multiple', route: '/modals/finance' },
  { label: 'LIBRARY',     icon: 'book-outline', route: '/modals/library' },
  { label: 'FOCUS TIMER', icon: 'timer-outline', route: '/focus-timer' },
  { label: 'CALENDAR',    icon: 'calendar-month-outline', route: '/calendar' },
];

export default function LifeScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>LIFE</Text>
      </View>
      <ScrollView contentContainerStyle={styles.grid}>
        {CARDS.map(c => (
          <TouchableOpacity
            key={c.label}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => router.push(c.route as any)}
          >
            <MaterialCommunityIcons name={c.icon} size={26} color={ORANGE} />
            <Text style={styles.cardLabel}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 },
  title: { fontFamily: BOLD, fontSize: 24, color: INK, letterSpacing: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 12, paddingBottom: 40 },
  card: {
    width: '46%', backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center', gap: 10, minHeight: 100,
  },
  cardLabel: { fontFamily: REG, fontSize: 10, color: INK, textAlign: 'center', letterSpacing: 0.5 },
});
