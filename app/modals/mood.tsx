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
import { useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { getRecentMoodLogs, getTodayMood, logMood, pullRemoteMood, TRIGGERS, type MoodLog } from '@/lib/mood-data';

import { C, F } from '@/lib/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
const ORANGE = C.hot;
const CARD   = C.surface;
const REG = F.mono;

export default function MoodModal() {
  const [mood, setMood] = useState(5);
  const [stress, setStress] = useState(5);
  const [triggers, setTriggers] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [recent, setRecent] = useState<MoodLog[]>([]);

  const refresh = useCallback(async () => {
    await pullRemoteMood(); // voice-logged moods are written server-side
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
      <ScreenHeader title="MOOD" close
      />

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

          <TextInput style={styles.input} placeholder="Note (optional)" placeholderTextColor={C.dim} value={note} onChangeText={setNote} multiline />

          <TouchableOpacity style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveBtnText}>SAVE TODAY</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>LAST 14 DAYS</Text>
        {recent.length === 0 && <Text style={styles.emptyText}>No entries yet. Save today's to start the chart.</Text>}
        <View style={styles.sparkRow}>
          {recent.map(r => (
            <View key={r.date} style={[styles.sparkBar, { height: 8 + r.moodScore * 3 }]} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: CARD, borderRadius: 16, borderCurve: 'continuous', borderWidth: 1, borderColor: C.line, padding: 14, gap: 10 },
  label: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 2, marginTop: 4 },
  scaleRow: { flexDirection: 'row', gap: 4 },
  scaleDot: { flex: 1, height: 40, borderRadius: 8, borderCurve: 'continuous', backgroundColor: C.line },
  scaleDotActive: { backgroundColor: ORANGE },
  scaleDotStress: { backgroundColor: C.alert },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: C.line },
  chipActive: { backgroundColor: ORANGE, borderColor: C.hot },
  chipText: { fontFamily: F.dot, fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: 'uppercase' },
  chipTextActive: { color: C.onHot },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 10, borderCurve: 'continuous', padding: 12, fontFamily: REG, fontSize: 12, color: C.ink, minHeight: 60, textAlignVertical: 'top' },
  saveBtn: { backgroundColor: ORANGE, borderRadius: 999, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { fontFamily: F.dot, fontSize: 12, color: C.onHot, letterSpacing: 2 },
  sectionLabel: { fontFamily: F.dot, fontSize: 11, color: C.dim, letterSpacing: 3, marginTop: 6 },
  sparkRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 40 },
  sparkBar: { flex: 1, backgroundColor: C.hot, borderRadius: 2 },
  emptyText: { fontFamily: F.mono, fontSize: 12, color: C.dim },
});
