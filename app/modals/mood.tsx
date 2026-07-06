// ─────────────────────────────────────────────────────────────────────────
// MOOD MODAL (task 066) — 1-10 mood + stress, triggers, optional note.
// Journal/therapy notes are deliberately NOT built here — see
// supabase/migrations/019_mental_health.sql's header comment: real
// client-side encryption is required "before a single field ships" and
// this session has no crypto dependency installed or device to verify one.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { getRecentMoodLogs, getTodayMood, logMood, TRIGGERS, type MoodLog } from '@/lib/mood-data';
import ChatScreen from '@/components/ChatScreen';

const ORANGE = '#FF4D00';
const INK    = '#1A1714';
const MUTED  = '#8C857B';
const BORDER = '#E5E1DA';
const CARD   = '#FCFBF9';
const BG     = '#F4F2EE';
const BOLD   = 'PixeloidSans_700Bold';
const REG    = 'PixeloidSans_400Regular';

export default function MoodModal() {
  const router = useRouter();
  const [mood, setMood] = useState(5);
  const [stress, setStress] = useState(5);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<MoodLog[]>([]);
  const [chatOpen, setChatOpen] = useState(false);

  const refresh = useCallback(async () => {
    const [today, week] = await Promise.all([getTodayMood(), getRecentMoodLogs(14)]);
    if (today) { setMood(today.moodScore); setStress(today.stressScore ?? 5); setTriggers(today.triggers); setNote(today.note ?? ''); }
    setRecent(week);
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  function toggleTrigger(t: string) {
    setTriggers(cur => (cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t]));
  }

  async function save() {
    await logMood({ moodScore: mood, stressScore: stress, triggers, note: note.trim() || undefined });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <MaterialCommunityIcons name="close" size={22} color={INK} />
        </TouchableOpacity>
        <Text style={styles.title}>MOOD</Text>
        <TouchableOpacity onPress={() => setChatOpen(true)} hitSlop={12}>
          <MaterialCommunityIcons name="chat-processing-outline" size={20} color={ORANGE} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>MOOD: {mood}/10</Text>
          <View style={styles.scaleRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <TouchableOpacity key={n} style={[styles.scaleDot, n <= mood && styles.scaleDotActive]} onPress={() => setMood(n)} />
            ))}
          </View>

          <Text style={styles.label}>STRESS: {stress}/10</Text>
          <View style={styles.scaleRow}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <TouchableOpacity key={n} style={[styles.scaleDot, n <= stress && styles.scaleDotStress]} onPress={() => setStress(n)} />
            ))}
          </View>

          <Text style={styles.label}>TRIGGERS</Text>
          <View style={styles.chipRow}>
            {TRIGGERS.map(t => (
              <TouchableOpacity key={t} style={[styles.chip, triggers.includes(t) && styles.chipActive]} onPress={() => toggleTrigger(t)}>
                <Text style={[styles.chipText, triggers.includes(t) && styles.chipTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput style={styles.input} placeholder="Note (optional)" placeholderTextColor={MUTED} value={note} onChangeText={setNote} multiline />

          <TouchableOpacity style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>SAVE TODAY'S MOOD</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>LAST 14 DAYS</Text>
        <View style={styles.sparkRow}>
          {recent.map(r => (
            <View key={r.date} style={[styles.sparkBar, { height: 8 + r.moodScore * 3 }]} />
          ))}
        </View>
      </ScrollView>

      <ChatScreen
        visible={chatOpen}
        onClose={() => setChatOpen(false)}
        companionType="mood"
        onTasksUpdated={refresh}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontFamily: BOLD, fontSize: 16, color: INK },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14, gap: 10 },
  label: { fontFamily: BOLD, fontSize: 11, color: INK },
  scaleRow: { flexDirection: 'row', gap: 4 },
  scaleDot: { width: 20, height: 20, borderRadius: 4, backgroundColor: BORDER },
  scaleDotActive: { backgroundColor: ORANGE },
  scaleDotStress: { backgroundColor: '#C0432B' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: BORDER },
  chipActive: { backgroundColor: ORANGE, borderColor: ORANGE },
  chipText: { fontFamily: REG, fontSize: 11, color: MUTED, textTransform: 'capitalize' },
  chipTextActive: { color: '#FFFFFF', fontFamily: BOLD },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, padding: 12, fontFamily: REG, fontSize: 12, color: INK, minHeight: 60, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveBtnText: { fontFamily: BOLD, fontSize: 12, color: '#FFFFFF' },
  sectionLabel: { fontFamily: BOLD, fontSize: 11, color: MUTED },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 40 },
  sparkBar: { flex: 1, backgroundColor: ORANGE, borderRadius: 2 },
});
