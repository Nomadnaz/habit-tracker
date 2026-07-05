// ─────────────────────────────────────────────────────────────────────────
// GOALS MODAL (task 068) — structured goals/milestones/progress logging.
// Vision board (affirmations, vision_board_items) is explicitly optional
// polish per the task itself — not built here.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Modal, Pressable, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import {
  getActiveGoals, addGoal, setGoalStatus, getMilestones, addMilestone, toggleMilestone,
  getGoalLogs, computeProgress,
  type Goal, type Milestone, type GoalLog,
} from '@/lib/goals-data';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const GREEN  = '#3B7A57';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

type Row = { goal: Goal; milestones: Milestone[]; logs: GoalLog[] };

export default function GoalsModal() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [milestoneInput, setMilestoneInput] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const goals = await getActiveGoals();
    const rows = await Promise.all(goals.map(async g => ({
      goal: g, milestones: await getMilestones(g.id), logs: await getGoalLogs(g.id),
    })));
    setRows(rows);
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function saveGoal() {
    if (!title.trim()) return;
    await addGoal({ title: title.trim() });
    setTitle('');
    setAddVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  async function addMilestoneTo(goalId: string) {
    const text = (milestoneInput[goalId] ?? '').trim();
    if (!text) return;
    await addMilestone(goalId, text);
    setMilestoneInput(s => ({ ...s, [goalId]: '' }));
    refresh();
  }

  async function complete(goalId: string) {
    await setGoalStatus(goalId, 'done');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>GOALS</Text>
        <TouchableOpacity onPress={() => setAddVisible(true)} hitSlop={12}>
          <MaterialCommunityIcons name="plus" size={22} color={INK} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {rows.length === 0 && <Text style={styles.empty}>No active goals yet. Tap + to add one.</Text>}
        {rows.map(row => {
          const progress = computeProgress(row.milestones, row.logs);
          const isOpen = expanded === row.goal.id;
          return (
            <View key={row.goal.id} style={styles.card}>
              <TouchableOpacity onPress={() => setExpanded(isOpen ? null : row.goal.id)} style={styles.cardTop}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.goalTitle}>{row.goal.title}</Text>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{progress}%</Text>
                </View>
                <MaterialCommunityIcons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={MUTED} />
              </TouchableOpacity>

              {isOpen && (
                <View style={styles.detail}>
                  {row.milestones.map(m => (
                    <TouchableOpacity key={m.id} style={styles.milestoneRow} onPress={() => toggleMilestone(row.goal.id, m.id).then(refresh)}>
                      <MaterialCommunityIcons
                        name={m.completed ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={m.completed ? GREEN : MUTED}
                      />
                      <Text style={[styles.milestoneText, m.completed && styles.milestoneDone]}>{m.title}</Text>
                    </TouchableOpacity>
                  ))}
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Add a milestone"
                      placeholderTextColor={MUTED}
                      value={milestoneInput[row.goal.id] ?? ''}
                      onChangeText={t => setMilestoneInput(s => ({ ...s, [row.goal.id]: t }))}
                      onSubmitEditing={() => addMilestoneTo(row.goal.id)}
                    />
                    <TouchableOpacity style={styles.smallBtn} onPress={() => addMilestoneTo(row.goal.id)}>
                      <Text style={styles.smallBtnText}>ADD</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.doneBtn} onPress={() => complete(row.goal.id)}>
                    <Text style={styles.doneBtnText}>MARK GOAL DONE</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={addVisible} transparent animationType="fade" onRequestClose={() => setAddVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
          <Pressable style={styles.backdrop} onPress={() => setAddVisible(false)} />
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>NEW GOAL</Text>
            <TextInput style={styles.input} placeholder="e.g. Run a 10k" placeholderTextColor={MUTED} value={title} onChangeText={setTitle} autoFocus />
            <TouchableOpacity style={styles.saveBtn} onPress={saveGoal}>
              <Text style={styles.saveBtnText}>ADD GOAL</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  empty: { fontFamily: REG, fontSize: 12, color: MUTED, textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalTitle: { fontFamily: BOLD, fontSize: 13, color: INK },
  progressTrack: { height: 6, backgroundColor: BORDER, borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ORANGE },
  progressText: { fontFamily: REG, fontSize: 10, color: MUTED, marginTop: 4 },
  detail: { marginTop: 12, gap: 8 },
  milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  milestoneText: { fontFamily: REG, fontSize: 12, color: INK },
  milestoneDone: { color: MUTED, textDecorationLine: 'line-through' },
  row: { flexDirection: 'row', gap: 8 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 8, padding: 10, fontFamily: REG, fontSize: 12, color: INK },
  smallBtn: { backgroundColor: ORANGE, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' },
  smallBtnText: { fontFamily: BOLD, fontSize: 11, color: '#FFFFFF' },
  doneBtn: { borderWidth: 1, borderColor: GREEN, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 4 },
  doneBtnText: { fontFamily: BOLD, fontSize: 11, color: GREEN },
  modalWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: CARD, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 14 },
  sheetTitle: { fontFamily: BOLD, fontSize: 14, color: INK },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
});
