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
  Modal, Pressable, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getActiveHabits, addHabit, deleteHabit, getLogsForHabit, pullRemoteHabitLogs,
  toggleToday, computeStreakWithFreezes, buildHeatmap, isDoneOnDate, setAutoFreeze,
  type Habit, type HabitLog, type Frequency,
} from '@/lib/habits-data';
import {
  getActiveMedications, addMedication, deleteMedication, getLogsForMedication,
  toggleTodayDose, computeMedStreak, buildMedHeatmap, isDoseTakenOnDate,
  computeAdherence30d, courseProgress,
  type Medication, type MedicationLog, type MedType,
} from '@/lib/medications-data';
import { toDateKey } from '@/lib/dateKey';
import HeatmapCalendar from '@/components/HeatmapCalendar';

// ── Design tokens (identical to BODY / CALORIE pages) ───────────────────────
const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

type Section = 'habits' | 'meds';
type HabitRow = { habit: Habit; logs: HabitLog[] };
type MedRow = { med: Medication; logs: MedicationLog[] };

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

  async function handleToggle(row: HabitRow) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await toggleToday(row.habit);
    refresh();
  }

  function handleDelete(row: HabitRow) {
    Alert.alert(row.habit.name, 'Remove this habit?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteHabit(row.habit.id); refresh(); } },
    ]);
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
    await toggleTodayDose(row.med);
    refresh();
  }

  function handleDeleteMed(row: MedRow) {
    Alert.alert(row.med.name, 'Remove this medication?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteMedication(row.med.id); refresh(); } },
    ]);
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>{section === 'habits' ? 'HABITS' : 'MEDS'}</Text>
        <TouchableOpacity onPress={() => (section === 'habits' ? setAddVisible(true) : setAddMedVisible(true))} hitSlop={12}>
          <MaterialCommunityIcons name="plus" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      <View style={styles.segmentRow}>
        {(['habits', 'meds'] as Section[]).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.segment, section === s && styles.segmentActive]}
            onPress={() => setSection(s)}
          >
            <Text style={[styles.segmentText, section === s && styles.segmentTextActive]}>
              {s === 'habits' ? 'HABITS' : 'MEDICATION & SUPPLEMENTS'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'habits' ? (
        <ScrollView contentContainerStyle={styles.list}>
          {rows.length === 0 && (
            <Text style={styles.empty}>No habits yet. Tap + to add your first one.</Text>
          )}
          {rows.map(row => {
            const streak = computeStreakWithFreezes(row.habit, row.logs);
            const done = isDoneOnDate(row.logs, today);
            const cells = buildHeatmap(row.habit, row.logs);
            return (
              <View key={row.habit.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <TouchableOpacity style={styles.nameWrap} onLongPress={() => handleDelete(row)}>
                    <Text style={styles.habitName}>{row.habit.name}</Text>
                    <Text style={styles.streakText}>
                      {streak.current > 0 ? `${streak.current} day streak` : 'No active streak'}
                      {streak.longest > streak.current ? ` · best ${streak.longest}` : ''}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.completeBtn, done && styles.completeBtnDone]}
                    onPress={() => handleToggle(row)}
                  >
                    <MaterialCommunityIcons
                      name={done ? 'check-circle' : 'circle-outline'}
                      size={28}
                      color={done ? '#FFFFFF' : ORANGE}
                    />
                  </TouchableOpacity>
                </View>
                <HeatmapCalendar cells={cells} />
                <TouchableOpacity
                  style={styles.freezeRow}
                  onPress={() => setAutoFreeze(row.habit.id, !row.habit.autoFreezeEnabled).then(refresh)}
                >
                  <MaterialCommunityIcons
                    name={row.habit.autoFreezeEnabled ? 'snowflake' : 'snowflake-off'}
                    size={14}
                    color={row.habit.autoFreezeEnabled ? '#3B82F6' : MUTED}
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
          {medRows.length === 0 && (
            <Text style={styles.empty}>No medications or supplements yet. Tap + to add one.</Text>
          )}
          {medRows.map(row => {
            const streak = computeMedStreak(row.logs);
            const taken = isDoseTakenOnDate(row.logs, today);
            const cells = buildMedHeatmap(row.med, row.logs);
            const adherence = computeAdherence30d(row.med, row.logs);
            const course = courseProgress(row.med);
            return (
              <View key={row.med.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <TouchableOpacity style={styles.nameWrap} onLongPress={() => handleDeleteMed(row)}>
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
                  >
                    <MaterialCommunityIcons
                      name={taken ? 'check-circle' : 'circle-outline'}
                      size={28}
                      color={taken ? '#FFFFFF' : ORANGE}
                    />
                  </TouchableOpacity>
                </View>
                <HeatmapCalendar cells={cells} />
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAddVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>NEW HABIT</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Read 10 pages"
              placeholderTextColor={MUTED}
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
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={addMedVisible} transparent animationType="fade" onRequestClose={() => setAddMedVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAddMedVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>NEW MEDICATION / SUPPLEMENT</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Vitamin D, Antibiotic course"
              placeholderTextColor={MUTED}
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
              placeholderTextColor={MUTED}
              value={medCourseLength}
              onChangeText={setMedCourseLength}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={saveMed}>
              <Text style={styles.saveBtnText}>ADD</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  segmentRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  segment: {
    flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: BORDER,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  segmentText: { fontFamily: REG, fontSize: 9, color: MUTED },
  segmentTextActive: { color: '#FFFFFF' },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 40 },
  card: {
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    padding: 14, gap: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameWrap: { flex: 1 },
  habitName: { fontFamily: BOLD, fontSize: 13, color: INK },
  streakText: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 2 },
  freezeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  freezeText: { fontFamily: REG, fontSize: 9, color: MUTED },
  completeBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: ORANGE,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  completeBtnDone: { backgroundColor: ORANGE, borderColor: ORANGE },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  sheetTitle: { fontFamily: BOLD, fontSize: 14, color: INK },
  input: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12,
    fontFamily: REG, fontSize: 13, color: INK,
  },
  freqRow: { flexDirection: 'row', gap: 8 },
  freqChip: {
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: BORDER,
  },
  freqChipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  freqChipText: { fontFamily: REG, fontSize: 11, color: MUTED },
  freqChipTextActive: { color: '#FFFFFF' },
  saveBtn: {
    backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center',
  },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
});
