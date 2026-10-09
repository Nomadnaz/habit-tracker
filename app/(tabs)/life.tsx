// ─────────────────────────────────────────────────────────────────────────
// LIFE — everything that isn't today, the body or training, as one
// departure board. Pure navigation: each row routes to an existing screen.
// HABITS lives here now that it has no tab slot of its own.
// ─────────────────────────────────────────────────────────────────────────

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { C, F } from '@/lib/theme';
import { Board, BoardRow } from '@/components/Board';

const ROUTINE = [
  { label: 'HABITS', sub: 'Streaks, check-ins, meds', route: '/(tabs)/habits' },
  { label: 'FOCUS', sub: 'Timed deep-work blocks', route: '/focus-timer' },
  { label: 'CALENDAR', sub: 'Month view and day plans', route: '/calendar' },
];
const AMBITION = [
  { label: 'GOALS', sub: 'Targets and milestones', route: '/modals/goals' },
  { label: 'FINANCE', sub: 'Spending, budgets, bills', route: '/modals/finance' },
  { label: 'LIBRARY', sub: 'Books, ideas, links, films', route: '/modals/library' },
];
const SYSTEM = [
  { label: 'PUCK DEVICE', sub: 'Pair and sync the puck', route: '/ble-bridge' },
  { label: 'SETTINGS', sub: 'Account, companion, export', route: '/settings' },
];

export default function LifeScreen() {
  const router = useRouter();
  const arrow = <MaterialCommunityIcons name="arrow-right" size={16} color={C.dim} />;
  const rows = (list: typeof ROUTINE) => list.map((r, i) => (
    <BoardRow key={r.label} index={i + 1} label={r.label} sub={r.sub} right={arrow}
      last={i === list.length - 1} onPress={() => router.push(r.route as any)} />
  ));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>DEPARTURES</Text>
          <Text style={styles.title}>LIFE</Text>
        </View>
        <Board title="ROUTINE">{rows(ROUTINE)}</Board>
        <Board title="AMBITION">{rows(AMBITION)}</Board>
        <Board title="SYSTEM">{rows(SYSTEM)}</Board>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 4 },
});
