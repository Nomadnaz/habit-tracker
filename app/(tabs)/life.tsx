// ─────────────────────────────────────────────────────────────────────────
// LIFE — today's habit check-ins first (tap a row to tick it), meds if you
// have any, then everything else that isn't today, the body or training as
// one compact grid of shortcuts. Managing habits (add, delete, heatmaps)
// lives on the full HABITS screen behind "ALL".
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { C, F } from '@/lib/theme';
import { Board, BoardRow } from '@/components/Board';
import { toDateKey } from '@/lib/dateKey';
import {
  getActiveHabits, getLogsForHabit, pullRemoteHabitLogs, toggleToday, isDoneOnDate,
  computeStreakWithFreezes, type Habit, type HabitLog,
} from '@/lib/habits-data';
import {
  getActiveMedications, getLogsForMedication, toggleTodayDose, isDoseTakenOnDate,
  type Medication, type MedicationLog,
} from '@/lib/medications-data';

type Icon = keyof typeof MaterialCommunityIcons.glyphMap;

const SHORTCUTS: { label: string; icon: Icon; route: string }[] = [
  { label: 'FOCUS', icon: 'timer-outline', route: '/focus-timer' },
  { label: 'CALENDAR', icon: 'calendar-month-outline', route: '/calendar' },
  { label: 'GOALS', icon: 'flag-outline', route: '/modals/goals' },
  { label: 'FINANCE', icon: 'wallet-outline', route: '/modals/finance' },
  { label: 'LIBRARY', icon: 'bookshelf', route: '/modals/library' },
  { label: 'PUCK', icon: 'checkbox-blank', route: '/ble-bridge' },
];

export default function LifeScreen() {
  const router = useRouter();
  const [habits, setHabits] = useState<{ habit: Habit; logs: HabitLog[] }[] | null>(null);
  const [meds, setMeds] = useState<{ med: Medication; logs: MedicationLog[] }[]>([]);

  const refresh = useCallback(async () => {
    const hs = await getActiveHabits();
    setHabits(await Promise.all(hs.map(async habit => ({ habit, logs: await getLogsForHabit(habit.id) }))));
    const ms = await getActiveMedications();
    setMeds(await Promise.all(ms.map(async med => ({ med, logs: await getLogsForMedication(med.id) }))));
  }, []);

  useFocusEffect(useCallback(() => {
    void refresh();
    // Ticks from the puck are written server-side; pull, then re-read.
    void pullRemoteHabitLogs().then(found => { if (found) void refresh(); });
  }, [refresh]));

  const today = toDateKey(new Date());
  const doneCount = habits?.filter(h => isDoneOnDate(h.logs, today)).length ?? 0;

  async function tick(habit: Habit) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleToday(habit);
    void refresh();
  }

  async function dose(med: Medication) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleTodayDose(med);
    void refresh();
  }

  const all = (
    <Pressable onPress={() => router.push('/(tabs)/habits')} hitSlop={16} style={styles.allBtn}>
      <Text style={styles.allText}>ALL ›</Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>
            {habits && habits.length > 0 ? `${doneCount} OF ${habits.length} HABITS DONE` : 'HABITS AND THE REST'}
          </Text>
          <Text style={styles.title}>LIFE</Text>
        </View>

        {habits && (
          <Board title="HABITS" right={all}>
            {habits.length === 0 ? (
              <BoardRow index="+" label="ADD YOUR FIRST HABIT" sub="Tap to set one up" last
                onPress={() => router.push('/(tabs)/habits')} />
            ) : habits.map(({ habit, logs }, i) => {
              const done = isDoneOnDate(logs, today);
              const streak = computeStreakWithFreezes(habit, logs).current;
              return (
                <BoardRow key={habit.id} index={i + 1} label={habit.name.toUpperCase()}
                  sub={streak > 0 ? `${streak} day streak` : habit.frequency === 'weekly' ? 'Weekly' : 'Daily'}
                  last={i === habits.length - 1}
                  right={<Check on={done} />}
                  onPress={() => tick(habit)} />
              );
            })}
          </Board>
        )}

        {meds.length > 0 && (
          <Board title="MEDS">
            {meds.map(({ med, logs }, i) => (
              <BoardRow key={med.id} index={i + 1} label={med.name.toUpperCase()}
                sub={med.type === 'supplement' ? 'Supplement' : 'Medication'}
                last={i === meds.length - 1}
                right={<Check on={isDoseTakenOnDate(logs, today)} />}
                onPress={() => dose(med)} />
            ))}
          </Board>
        )}

        <Text style={styles.sectionTitle}>MORE</Text>
        <View style={styles.grid}>
          {SHORTCUTS.map((s, i) => (
            <Pressable key={s.label} onPress={() => router.push(s.route as any)}
              style={({ pressed }) => [styles.tile, { borderRightWidth: i % 3 === 2 ? 0 : 1, borderBottomWidth: i >= 3 ? 0 : 1 }, pressed && { backgroundColor: C.raised }]}>
              <MaterialCommunityIcons name={s.icon} size={20} color={C.ink} />
              <Text style={styles.tileText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <View style={[styles.check, on && styles.checkOn]}>
      {on && <MaterialCommunityIcons name="check" size={16} color={C.onHot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6 },
  eyebrow: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 3 },
  title: { fontFamily: F.dot, fontSize: 40, color: C.ink, letterSpacing: 2, marginTop: 4 },
  allBtn: { paddingHorizontal: 4 },
  allText: { fontFamily: F.dot, fontSize: 11, color: C.ink, letterSpacing: 2 },
  check: { width: 28, height: 28, borderRadius: 8, borderWidth: 1.5, borderColor: C.lineHi, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: C.hot, borderColor: C.hot },
  sectionTitle: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3, marginHorizontal: 20, marginTop: 18, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: 16, borderWidth: 1, borderColor: C.line, borderRadius: 16, overflow: 'hidden', backgroundColor: C.surface },
  tile: { width: '33.333%', minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 8, borderColor: C.line },
  tileText: { fontFamily: F.dot, fontSize: 10, color: C.ink, letterSpacing: 1.5 },
});
