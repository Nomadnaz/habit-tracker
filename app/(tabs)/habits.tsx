// ─────────────────────────────────────────────────────────────────────────
// HABITS TAB — list of active habits, per-habit streak + heatmap, a
// completion button, and an add-habit flow (task 023). A MEDS toggle at the
// top switches to the Medication & Supplements sub-section (task 024) —
// same screen, not a separate tab, per that task's spec. Data lives in
// lib/habits-data.ts / lib/medications-data.ts (local-first, mirrors
// lib/meals-data.ts's pattern).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getActiveHabits, addHabit, deleteHabit, getLogsForHabit, pullRemoteHabitLogs,
  toggleToday, computeStreakWithFreezes, buildHeatmap, isDoneOnDate, setAutoFreeze, flipHabitDay,
  type Habit, type HabitLog, type Frequency,
} from '@/lib/habits-data';
import {
  getActiveMedications, addMedication, deleteMedication, getLogsForMedication,
  toggleTodayDose, computeMedStreak, buildMedHeatmap, isDoseTakenOnDate, flipDoseDay,
  computeAdherence30d, courseProgress,
  type Medication, type MedicationLog, type MedType,
} from '@/lib/medications-data';
import { toDateKey } from '@/lib/dateKey';
import { removeWithUndo, usePendingRemovals } from '@/lib/undo';
import { useRevalidate } from '@/lib/revalidate';
import HeatmapCalendar from '@/components/HeatmapCalendar';

import { C, F } from '@/lib/theme';
import { TAP, hit } from '@/lib/hit';
import { ScreenHeader, HeaderIcon } from '@/components/ScreenHeader';
import { Sheet } from '@/components/today/bits';
import { BALANCE } from '@/lib/text-wrap';
// ── Design tokens (identical to BODY / CALORIE pages) ───────────────────────
const ORANGE = C.hot;
const BOLD = F.mono;
const REG = F.mono;

type Section = 'habits' | 'meds';
type HabitRow = { habit: Habit; logs: HabitLog[] };
type MedRow = { med: Medication; logs: MedicationLog[] };

const notSaved = () => Alert.alert("Couldn't save that", "It's back how it was. Try again.");

export default function HabitsScreen() {
  const [section, setSection] = useState<Section>('habits');

  const [rows, setRows] = useState<HabitRow[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');

  const [medRows, setMedRows] = useState<MedRow[]>([]);
  const [addMedVisible, setAddMedVisible] = useState(false);
  const [medName, setMedName] = useState('');
  const [medType, setMedType] = useState<MedType>('medication');
  const [medCourseLength, setMedCourseLength] = useState('');
  const gone = usePendingRemovals();

  const refresh = useCallback(async () => {
    // Habits ticked by the voice device are written server-side; this layer is
    // local-first and was push-only, so pull before reading or they never show.
    await pullRemoteHabitLogs();
    const habits = await getActiveHabits();
    const logs = await Promise.all(habits.map(h => getLogsForHabit(h.id)));
    setRows(habits.map((habit, i) => ({ habit, logs: logs[i] })));

    const meds = await getActiveMedications();
    const medLogs = await Promise.all(meds.map(m => getLogsForMedication(m.id)));
    setMedRows(meds.map((med, i) => ({ med, logs: medLogs[i] })));
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useRevalidate(() => { void refresh(); }); // back from the background or back online: pull again

  // Ticks show the moment you tap; refresh() pulls from the server first, so
  // waiting on it made every tap lag. A failed write re-reads and says so.
  async function handleToggle(row: HabitRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const day = toDateKey(new Date());
    setRows(rs => rs.map(r => (r.habit.id === row.habit.id ? { ...r, logs: flipHabitDay(r.logs, row.habit.id, day).logs } : r)));
    try { await toggleToday(row.habit); } catch { notSaved(); }
    refresh();
  }

  // Long-press removes at once; the toast's UNDO brings it back (lib/undo.ts).
  function handleDelete(row: HabitRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key: row.habit.id, label: `${row.habit.name.toUpperCase()} REMOVED`, commit: () => deleteHabit(row.habit.id), after: refresh });
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    await addHabit({ name: trimmed, frequency });
    setName('');
    setFrequency('daily');
    setAddVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function handleToggleDose(row: MedRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const day = toDateKey(new Date());
    setMedRows(rs => rs.map(r => (r.med.id === row.med.id ? { ...r, logs: flipDoseDay(r.logs, row.med.id, day).logs } : r)));
    try { await toggleTodayDose(row.med); } catch { notSaved(); }
    refresh();
  }

  async function toggleFreeze(row: HabitRow) {
    const on = !row.habit.autoFreezeEnabled;
    setRows(rs => rs.map(r => (r.habit.id === row.habit.id ? { ...r, habit: { ...r.habit, autoFreezeEnabled: on } } : r)));
    try { await setAutoFreeze(row.habit.id, on); } catch { notSaved(); }
    refresh();
  }

  function handleDeleteMed(row: MedRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    removeWithUndo({ key: row.med.id, label: `${row.med.name.toUpperCase()} REMOVED`, commit: () => deleteMedication(row.med.id), after: refresh });
  }

  async function saveMed() {
    const trimmed = medName.trim();
    if (!trimmed) return;
    const courseLength = medCourseLength.trim() ? parseInt(medCourseLength, 10) : undefined;
    await addMedication({ name: trimmed, type: medType, courseLength: courseLength && !Number.isNaN(courseLength) ? courseLength : undefined });
    setMedName('');
    setMedType('medication');
    setMedCourseLength('');
    setAddMedVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  const today = toDateKey(new Date());
  const shownRows = rows.filter(r => !gone.has(r.habit.id));
  const shownMeds = medRows.filter(r => !gone.has(r.med.id));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title={section === 'habits' ? 'HABITS' : 'MEDS'}
        right={<>
          <HeaderIcon icon="plus" label="Add" onPress={() => (section === 'habits' ? setAddVisible(true) : setAddMedVisible(true))} />
        </>}
      />

      <View style={styles.segmentRow}>
        {(['habits', 'meds'] as Section[]).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.segment, section === s && styles.segmentActive]}
            onPress={() => setSection(s)}
            hitSlop={hit(100, 40)}
          >
            <Text style={[styles.segmentText, section === s && styles.segmentTextActive]}>
              {s === 'habits' ? 'HABITS' : 'MEDS & SUPPLEMENTS'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'habits' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {shownRows.length === 0 && (
            <Text style={styles.empty} {...BALANCE}>No habits yet. Tap + to add your first one.</Text>
          )}
          {shownRows.map(row => {
            const streak = computeStreakWithFreezes(row.habit, row.logs);
            const done = isDoneOnDate(row.logs, today);
            const cells = buildHeatmap(row.habit, row.logs);
            return (
              <View key={row.habit.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <TouchableOpacity style={styles.nameWrap} onLongPress={() => handleDelete(row)} hitSlop={hit(200, 34)}>
                    <Text style={styles.habitName}>{row.habit.name}</Text>
                    <Text style={styles.streakText}>
                      {streak.current > 0 ? `${streak.current} day streak` : 'No active streak'}
                      {streak.longest > streak.current ? ` · best ${streak.longest}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.completeBtn, done && styles.completeBtnDone]}
                    onPress={() => handleToggle(row)}
                    hitSlop={hit(40)}
                    accessibilityLabel={done ? `Untick ${row.habit.name}` : `Tick ${row.habit.name}`}
                  >
                    <MaterialCommunityIcons
                      name={done ? 'check-circle' : 'circle-outline'}
                      size={28}
                      color={done ? C.onHot : C.hot}
                    />
                  </TouchableOpacity>
                </View>
                <HeatmapCalendar cells={cells} />
                <TouchableOpacity
                  style={styles.freezeRow}
                  onPress={() => toggleFreeze(row)}
                  hitSlop={hit(160, 16)}
                >
                  <MaterialCommunityIcons
                    name={row.habit.autoFreezeEnabled ? 'snowflake' : 'snowflake-off'}
                    size={14}
                    color={row.habit.autoFreezeEnabled ? '#3B82F6' : C.dim}
                  />
                  <Text style={styles.freezeText}>
                    {row.habit.autoFreezeEnabled ? 'Auto-freeze on (2/month)' : 'Auto-freeze off'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {shownMeds.length === 0 && (
            <Text style={styles.empty} {...BALANCE}>No medications or supplements yet. Tap + to add one.</Text>
          )}
          {shownMeds.map(row => {
            const streak = computeMedStreak(row.logs);
            const taken = isDoseTakenOnDate(row.logs, today);
            const cells = buildMedHeatmap(row.med, row.logs);
            const adherence = computeAdherence30d(row.med, row.logs);
            const course = courseProgress(row.med);
            return (
              <View key={row.med.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <TouchableOpacity style={styles.nameWrap} onLongPress={() => handleDeleteMed(row)} hitSlop={hit(200, 34)}>
                    <Text style={styles.habitName}>{row.med.name}</Text>
                    <Text style={styles.streakText}>
                      {streak.current > 0 ? `${streak.current} day streak` : 'No active streak'}
                      {' · '}{adherence}% adherence (30d)
                      {course ? ` · Day ${course.day} of ${course.total}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.completeBtn, taken && styles.completeBtnDone]}
                    onPress={() => handleToggleDose(row)}
                    hitSlop={hit(40)}
                    accessibilityLabel={taken ? `Untick ${row.med.name}` : `Tick ${row.med.name}`}
                  >
                    <MaterialCommunityIcons
                      name={taken ? 'check-circle' : 'circle-outline'}
                      size={28}
                      color={taken ? C.onHot : C.hot}
                    />
                  </TouchableOpacity>
                </View>
                <HeatmapCalendar cells={cells} />
              </View>
            );
          })}
        </ScrollView>
      )}

      <Sheet visible={addVisible} onClose={() => setAddVisible(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>NEW HABIT</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Read 10 pages"
            placeholderTextColor={C.dim}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View style={styles.freqRow}>
            {(['daily', 'weekly'] as Frequency[]).map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.freqChip, frequency === f && styles.freqChipActive]}
                onPress={() => setFrequency(f)}
                hitSlop={hit(70, 40)}
              >
                <Text style={[styles.freqChipText, frequency === f && styles.freqChipTextActive]}>
                  {f.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>ADD HABIT</Text>
          </TouchableOpacity>
        </View>
      </Sheet>

      <Sheet visible={addMedVisible} onClose={() => setAddMedVisible(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>NEW MEDICATION / SUPPLEMENT</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Vitamin D, Antibiotic course"
            placeholderTextColor={C.dim}
            value={medName}
            onChangeText={setMedName}
            autoFocus
          />
          <View style={styles.freqRow}>
            {(['medication', 'supplement'] as MedType[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.freqChip, medType === t && styles.freqChipActive]}
                onPress={() => setMedType(t)}
                hitSlop={hit(70, 40)}
              >
                <Text style={[styles.freqChipText, medType === t && styles.freqChipTextActive]}>
                  {t.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="Course length in days (optional, e.g. 7)"
            placeholderTextColor={C.dim}
            value={medCourseLength}
            onChangeText={setMedCourseLength}
            keyboardType="number-pad"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={saveMed}>
            <Text style={styles.saveBtnText}>ADD</Text>
          </TouchableOpacity>
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  segmentRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  segment: { flex: 1, minHeight: 40, paddingHorizontal: 6, borderRadius: 999, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: ORANGE, borderColor: C.hot },
  segmentText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5 },
  segmentTextActive: { color: C.onHot },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  empty: { fontFamily: REG, fontSize: 12, color: C.dim, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: C.surface, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line,
    padding: 14, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameWrap: { flex: 1 },
  habitName: { fontFamily: BOLD, fontSize: 13, color: C.ink },
  streakText: { fontFamily: REG, fontSize: 11, color: C.dim, marginTop: 2 },
  freezeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  freezeText: { fontFamily: REG, fontSize: 10, color: C.dim },
  completeBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.hot,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  completeBtnDone: { backgroundColor: ORANGE, borderColor: C.hot },
  sheet: { gap: 14, paddingBottom: 4 },
  sheetTitle: { fontFamily: BOLD, fontSize: 14, color: C.ink },
  input: {
    borderWidth: 1, borderColor: C.line, borderRadius: 10, borderCurve: 'continuous', padding: 12,
    fontFamily: REG, fontSize: 13, color: C.ink,
  },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: {
    minHeight: 40, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line,
  },
  freqChipActive: { backgroundColor: ORANGE, borderColor: C.hot },
  freqChipText: { fontFamily: REG, fontSize: 12, color: C.dim },
  freqChipTextActive: { color: C.surface },
  saveBtn: {
    backgroundColor: C.hot, borderRadius: 10, borderCurve: 'continuous', minHeight: TAP, justifyContent: 'center', paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: C.onHot },
});
